import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthLayout } from "@/components/medlink/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/errors";
import { passwordSchema, PasswordRules } from "@/components/medlink/PasswordRules";
import { PasswordInput } from "@/components/medlink/PasswordInput";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nouveau mot de passe — MedLink" },
      {
        name: "description",
        content: "Définissez un nouveau mot de passe pour votre compte MedLink.",
      },
      { property: "og:title", content: "Nouveau mot de passe — MedLink" },
      { property: "og:description", content: "Définition d'un nouveau mot de passe MedLink." },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const isRecovery = /type=(recovery|invite)/.test(window.location.hash);
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    supabase.auth.getSession().then(({ data: s }) => {
      if (s.session && isRecovery) setReady(true);
    });
    if (isRecovery) setReady(true);
    return () => data.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const p = passwordSchema.safeParse(pw);
    if (!p.success) return setError(p.error.issues[0]?.message ?? "Mot de passe invalide");
    if (pw !== confirm) return setError("Les mots de passe ne correspondent pas");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (error) return setError(friendlyError(error));
    await supabase.auth.signOut();
    toast.success("Mot de passe mis à jour. Connectez-vous avec votre nouveau mot de passe.");
    navigate({ to: "/login" });
  };

  return (
    <AuthLayout title="Nouveau mot de passe">
      {!ready ? (
        <Alert>
          <AlertDescription>
            Ce lien est invalide ou a expiré. Demandez un nouveau lien depuis « Mot de passe oublié
            ».
          </AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="pw">Nouveau mot de passe</Label>
            <PasswordInput
              id="pw"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete="new-password"
            />
            <PasswordRules value={pw} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cf">Confirmer</Label>
            <PasswordInput
              id="cf"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" className="h-11 w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />} Enregistrer
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
