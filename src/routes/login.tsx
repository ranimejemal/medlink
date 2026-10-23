import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AuthLayout } from "@/components/medlink/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { secureSignIn } from "@/lib/auth.functions";
import { homeFor, loadAccess, MFA_REQUIRED } from "@/lib/access";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Connexion — MedLink" },
      { name: "description", content: "Connectez-vous à votre espace MedLink sécurisé." },
      { property: "og:title", content: "Connexion — MedLink" },
      { property: "og:description", content: "Accès sécurisé au portail médical MedLink." },
    ],
  }),
  component: LoginPage,
});

const schema = z.object({ email: z.string().trim().email("Adresse e-mail invalide"), password: z.string().min(1, "Mot de passe requis") });

const DEMO = [
  ["Patient", "patient.demo@medlink.test"],
  ["Praticien", "doctor.demo@medlink.test"],
  ["Administrateur", "admin.demo@medlink.test"],
  ["Personnel", "staff.demo@medlink.test"],
];

function LoginPage() {
  const navigate = useNavigate();
  const signIn = useServerFn(secureSignIn);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Formulaire invalide");
    setLoading(true);
    try {
      const res = await signIn({ data: parsed.data });
      if (!res.ok) return setError(res.error);
      await supabase.auth.setSession({ access_token: res.access_token, refresh_token: res.refresh_token });
      const access = await loadAccess();
      if (!access) return setError("Connexion impossible.");
      if (access.roles.some((r) => MFA_REQUIRED.includes(r))) navigate({ to: "/mfa" });
      else navigate({ to: homeFor(access.roles) });
    } catch {
      setError("Le service est momentanément indisponible. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Connexion"
      subtitle="Accédez à votre espace MedLink."
      footer={<>Pas encore de compte ? <Link to="/register" className="font-medium text-primary hover:underline">Créer un compte patient</Link></>}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <div className="space-y-2">
          <Label htmlFor="email">Adresse e-mail</Label>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Mot de passe</Label>
            <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">Mot de passe oublié ?</Link>
          </div>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} />
        </div>
        <Button type="submit" className="h-11 w-full" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />} Se connecter
        </Button>
      </form>
      <div className="mt-8 rounded-xl border border-dashed bg-muted/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comptes de démonstration (fictifs)</p>
        <ul className="mt-2 space-y-1.5">
          {DEMO.map(([label, mail]) => (
            <li key={mail}>
              <button type="button" onClick={() => setEmail(mail ?? "")} className="flex w-full justify-between gap-2 text-left text-xs hover:text-primary">
                <span className="text-muted-foreground">{label}</span><span className="font-mono">{mail}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">Mot de passe : <span className="font-mono">MedLink#Demo2026</span></p>
      </div>
    </AuthLayout>
  );
}
