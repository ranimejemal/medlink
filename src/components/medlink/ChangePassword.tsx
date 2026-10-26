import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { logSecurityEvent } from "@/lib/auth.functions";
import { friendlyError } from "@/lib/errors";
import { Panel } from "@/components/medlink/ui";
import { passwordSchema, PasswordRules } from "@/components/medlink/PasswordRules";
import { PasswordInput } from "@/components/medlink/PasswordInput";

const URL = import.meta.env["VITE_SUPABASE_URL"] as string;
const KEY = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string;

/** Checks the current password on a throw-away client, so the real session (and its MFA level) is untouched. */
async function currentPasswordIsValid(email: string, password: string): Promise<boolean> {
  const probe = createClient(URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (KEY.startsWith("sb_publishable_") && headers.get("Authorization") === `Bearer ${KEY}`)
          headers.delete("Authorization");
        headers.set("apikey", KEY);
        return fetch(input, { ...init, headers });
      },
    },
  });
  const { error } = await probe.auth.signInWithPassword({ email, password });
  return !error;
}

export function ChangePasswordCard() {
  const log = useServerFn(logSecurityEvent);
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!current) return setError("Saisissez votre mot de passe actuel.");
    const p = passwordSchema.safeParse(pw);
    if (!p.success)
      return setError("Le nouveau mot de passe ne respecte pas les règles de sécurité.");
    if (pw !== confirm) return setError("Les mots de passe ne correspondent pas.");
    if (pw === current) return setError("Le nouveau mot de passe doit être différent de l'actuel.");

    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    const email = u.user?.email;
    if (!email) {
      setLoading(false);
      return setError("Session expirée. Reconnectez-vous.");
    }
    if (!(await currentPasswordIsValid(email, current))) {
      setLoading(false);
      return setError("Mot de passe actuel incorrect.");
    }

    const { error: upErr } = await supabase.auth.updateUser({ password: pw });
    if (upErr) {
      setLoading(false);
      console.error("[change-password] updateUser failed:", {
        code: (upErr as { code?: string }).code,
        message: upErr.message,
      });
      return setError(
        /same|different/i.test(upErr.message)
          ? "Le nouveau mot de passe doit être différent de l'actuel."
          : friendlyError(upErr),
      );
    }
    try {
      await log({ data: { action: "password.changed" } });
    } catch {
      /* best effort */
    }
    await supabase.auth.signOut({ scope: "others" }); // sign out every other device
    setLoading(false);
    setCurrent("");
    setPw("");
    setConfirm("");
    toast.success("Mot de passe modifié. Les autres appareils ont été déconnectés.");
  };

  return (
    <Panel title="Changer le mot de passe">
      <form onSubmit={submit} className="max-w-md space-y-4" noValidate>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-2">
          <Label htmlFor="cur">Mot de passe actuel</Label>
          <PasswordInput
            id="cur"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new">Nouveau mot de passe</Label>
          <PasswordInput
            id="new"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="new-password"
          />
          <PasswordRules value={pw} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cnf">Confirmer le nouveau mot de passe</Label>
          <PasswordInput
            id="cnf"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />} Enregistrer
        </Button>
      </form>
    </Panel>
  );
}
