import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Loader2, MailCheck } from "lucide-react";
import { AuthLayout } from "@/components/medlink/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Mot de passe oublié — MedLink" },
      { name: "description", content: "Réinitialisez le mot de passe de votre compte MedLink." },
      { property: "og:title", content: "Mot de passe oublié — MedLink" },
      { property: "og:description", content: "Réinitialisation sécurisée du mot de passe MedLink." },
    ],
  }),
  component: ForgotPage,
});

function ForgotPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = z.string().trim().email().safeParse(email);
    if (!p.success) return setError("Adresse e-mail invalide");
    setLoading(true);
    await supabase.auth.resetPasswordForEmail(p.data, { redirectTo: `${window.location.origin}/reset-password` });
    setLoading(false);
    // Same message whether or not the account exists (no user enumeration).
    setSent(true);
  };

  return (
    <AuthLayout title="Mot de passe oublié" subtitle="Recevez un lien de réinitialisation par e-mail." footer={<Link to="/login" className="font-medium text-primary hover:underline">Retour à la connexion</Link>}>
      {sent ? (
        <div className="card-surface p-6 text-center">
          <MailCheck className="mx-auto h-10 w-10 text-success" />
          <p className="mt-3 text-sm text-muted-foreground">Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être envoyé.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <div className="space-y-2"><Label htmlFor="em">Adresse e-mail</Label><Input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <Button type="submit" className="h-11 w-full" disabled={loading}>{loading && <Loader2 className="h-4 w-4 animate-spin" />} Envoyer le lien</Button>
        </form>
      )}
    </AuthLayout>
  );
}
