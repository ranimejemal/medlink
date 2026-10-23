import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Loader2, MailCheck } from "lucide-react";
import { AuthLayout } from "@/components/medlink/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/errors";
import { passwordSchema, PasswordRules } from "@/components/medlink/PasswordRules";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Créer un compte patient — MedLink" },
      { name: "description", content: "Créez votre compte patient MedLink pour gérer vos rendez-vous et résultats." },
      { property: "og:title", content: "Créer un compte patient — MedLink" },
      { property: "og:description", content: "Inscription patient au portail médical MedLink." },
    ],
  }),
  component: RegisterPage,
});

const schema = z
  .object({
    first_name: z.string().trim().min(2, "Prénom requis").max(60),
    last_name: z.string().trim().min(2, "Nom requis").max(60),
    phone: z.string().trim().regex(/^(\+216)?\s?\d{2}\s?\d{3}\s?\d{3}$/, "Numéro tunisien invalide (ex. +216 20 123 456)"),
    email: z.string().trim().email("Adresse e-mail invalide").max(255),
    password: passwordSchema,
    confirm: z.string(),
    consent: z.literal(true, { errorMap: () => ({ message: "Vous devez accepter la politique de confidentialité" }) }),
  })
  .refine((d) => d.password === d.confirm, { message: "Les mots de passe ne correspondent pas", path: ["confirm"] });

function RegisterPage() {
  const [form, setForm] = useState({ first_name: "", last_name: "", phone: "", email: "", password: "", confirm: "", consent: false });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse(form);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Formulaire invalide");
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
        data: { first_name: parsed.data.first_name, last_name: parsed.data.last_name, phone: parsed.data.phone },
      },
    });
    setLoading(false);
    if (error) return setError(friendlyError(error));
    setDone(true);
  };

  if (done)
    return (
      <AuthLayout title="Vérifiez votre boîte mail">
        <div className="card-surface p-6 text-center">
          <MailCheck className="mx-auto h-10 w-10 text-success" />
          <p className="mt-3 text-sm text-muted-foreground">Un lien de confirmation a été envoyé à <strong>{form.email}</strong>. Cliquez dessus pour activer votre compte.</p>
          <Button asChild className="mt-5"><Link to="/login">Aller à la connexion</Link></Button>
        </div>
      </AuthLayout>
    );

  return (
    <AuthLayout title="Créer un compte patient" subtitle="Les comptes praticiens et administratifs sont créés par la clinique." footer={<>Déjà inscrit ? <Link to="/login" className="font-medium text-primary hover:underline">Se connecter</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="fn">Prénom</Label><Input id="fn" value={form.first_name} onChange={set("first_name")} autoComplete="given-name" /></div>
          <div className="space-y-2"><Label htmlFor="ln">Nom</Label><Input id="ln" value={form.last_name} onChange={set("last_name")} autoComplete="family-name" /></div>
        </div>
        <div className="space-y-2"><Label htmlFor="ph">Téléphone</Label><Input id="ph" value={form.phone} onChange={set("phone")} placeholder="+216 20 123 456" autoComplete="tel" /></div>
        <div className="space-y-2"><Label htmlFor="em">Adresse e-mail</Label><Input id="em" type="email" value={form.email} onChange={set("email")} autoComplete="email" /></div>
        <div className="space-y-2"><Label htmlFor="pw">Mot de passe</Label><Input id="pw" type="password" value={form.password} onChange={set("password")} autoComplete="new-password" /><PasswordRules value={form.password} /></div>
        <div className="space-y-2"><Label htmlFor="cf">Confirmer le mot de passe</Label><Input id="cf" type="password" value={form.confirm} onChange={set("confirm")} autoComplete="new-password" /></div>
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <Checkbox checked={form.consent} onCheckedChange={(v) => setForm({ ...form, consent: v === true })} className="mt-0.5" />
          J'accepte que mes données de santé soient traitées par MedLink conformément à la loi organique n° 2004-63 sur la protection des données personnelles.
        </label>
        <Button type="submit" className="h-11 w-full" disabled={loading}>{loading && <Loader2 className="h-4 w-4 animate-spin" />} Créer mon compte</Button>
      </form>
    </AuthLayout>
  );
}
