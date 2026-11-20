import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { PasswordInput } from "@/components/medlink/PasswordInput";
import { PrivacyPolicyDialog, PRIVACY_POLICY_VERSION } from "@/components/medlink/PrivacyPolicy";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Créer un compte patient — MedLink" },
      {
        name: "description",
        content: "Créez votre compte patient MedLink pour gérer vos rendez-vous et résultats.",
      },
      { property: "og:title", content: "Créer un compte patient — MedLink" },
      { property: "og:description", content: "Inscription patient au portail médical MedLink." },
    ],
  }),
  // Optional ?email= from the home page form, pre-filled in the form below.
  validateSearch: (search: Record<string, unknown>): { email?: string } =>
    typeof search["email"] === "string" ? { email: search["email"].slice(0, 255) } : {},
  component: RegisterPage,
});

const RESEND_COOLDOWN = 60;

const schema = z
  .object({
    first_name: z.string().trim().min(2, "Prénom requis").max(60),
    last_name: z.string().trim().min(2, "Nom requis").max(60),
    phone: z
      .string()
      .trim()
      .regex(
        /^(\+216)?\s?\d{2}\s?\d{3}\s?\d{3}$/,
        "Numéro tunisien invalide (ex. +216 20 123 456)",
      ),
    email: z.string().trim().email("Adresse e-mail invalide").max(255),
    password: passwordSchema,
    confirm: z.string(),
    consent: z.literal(true, {
      errorMap: () => ({ message: "Vous devez accepter la politique de confidentialité" }),
    }),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirm"],
  });

function RegisterPage() {
  const search = Route.useSearch();
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: search.email ?? "",
    password: "",
    confirm: "",
    consent: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [code, setCode] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const [existing, setExisting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);
  const navigate = useNavigate();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse(form);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Formulaire invalide");
    setLoading(true);
    setExisting(false);
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: {
          first_name: parsed.data.first_name,
          last_name: parsed.data.last_name,
          phone: parsed.data.phone.replace(/\s+/g, "").replace(/^(\d{8})$/, "+216$1"),
          // US-04: the server records the consent date (handle_new_user), not the browser.
          consent: true,
          consent_version: PRIVACY_POLICY_VERSION,
        },
      },
    });
    setLoading(false);
    if (error) {
      console.error("[register] signUp failed:", {
        code: (error as { code?: string }).code,
        status: error.status,
        message: error.message,
      });
      return setError(friendlyError(error));
    }
    // Address already registered: Supabase answers "ok" but sends no code (anti-enumeration).
    // Waiting for a code would block the user, so we send them to the sign-in page instead.
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      setExisting(true);
      return;
    }
    setDone(true);
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!/^\d{6,8}$/.test(code.trim()))
      return setError("Saisissez le code reçu par e-mail (chiffres uniquement).");
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email: form.email.trim(),
      token: code.trim(),
      type: "signup",
    });
    if (error) {
      setLoading(false);
      console.error("[register] verifyOtp failed:", {
        code: (error as { code?: string }).code,
        status: error.status,
        message: error.message,
      });
      return setError(
        /expired|invalid/i.test(error.message)
          ? "Code invalide ou expiré. Utilisez le code du dernier e-mail reçu, ou demandez un nouveau code."
          : friendlyError(error),
      );
    }
    // Sign out so that the user goes through the normal (audited, rate-limited) login flow.
    await supabase.auth.signOut();
    setLoading(false);
    navigate({ to: "/login" });
  };

  // Each new code cancels the previous one: one resend at a time, then wait 60 s.
  const resend = async () => {
    if (resending || cooldown > 0) return;
    setError(null);
    setInfo(null);
    setResending(true);
    const { error } = await supabase.auth.resend({ type: "signup", email: form.email.trim() });
    setResending(false);
    setCooldown(RESEND_COOLDOWN);
    if (error) return setError(friendlyError(error));
    setCode("");
    setInfo("Un nouveau code a été envoyé. Utilisez uniquement le code de ce dernier e-mail.");
  };

  if (done)
    return (
      <AuthLayout title="Vérifiez votre boîte mail">
        <form onSubmit={verify} className="card-surface space-y-4 p-6 text-center" noValidate>
          <MailCheck className="mx-auto h-10 w-10 text-success" />
          <p className="text-sm text-muted-foreground">
            Un code de confirmation a été envoyé à <strong>{form.email}</strong>. Saisissez-le
            ci-dessous pour activer votre compte.
          </p>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {info && (
            <Alert>
              <AlertDescription>{info}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2 text-left">
            <Label htmlFor="otp">Code de confirmation</Label>
            <Input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="text-center text-lg tracking-widest"
            />
          </div>
          <Button type="submit" className="h-11 w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />} Confirmer
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={resend}
            disabled={resending || cooldown > 0}
          >
            {resending
              ? "Envoi…"
              : cooldown > 0
                ? `Renvoyer le code (${cooldown} s)`
                : "Renvoyer le code"}
          </Button>
        </form>
      </AuthLayout>
    );

  return (
    <AuthLayout
      title="Créer un compte patient"
      subtitle="Les comptes praticiens et administratifs sont créés par la clinique."
      footer={
        <>
          Déjà inscrit ?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Se connecter
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {existing && (
          <Alert>
            <AlertDescription>
              Un compte existe déjà avec cette adresse e-mail.{" "}
              <Link to="/login" className="font-medium text-primary hover:underline">
                Connectez-vous
              </Link>{" "}
              ou utilisez{" "}
              <Link to="/forgot-password" className="font-medium text-primary hover:underline">
                Mot de passe oublié
              </Link>
              .
            </AlertDescription>
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fn">Prénom</Label>
            <Input
              id="fn"
              value={form.first_name}
              onChange={set("first_name")}
              autoComplete="given-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ln">Nom</Label>
            <Input
              id="ln"
              value={form.last_name}
              onChange={set("last_name")}
              autoComplete="family-name"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ph">Téléphone</Label>
          <Input
            id="ph"
            value={form.phone}
            onChange={set("phone")}
            placeholder="+216 20 123 456"
            autoComplete="tel"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="em">Adresse e-mail</Label>
          <Input
            id="em"
            type="email"
            value={form.email}
            onChange={set("email")}
            autoComplete="email"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pw">Mot de passe</Label>
          <PasswordInput
            id="pw"
            value={form.password}
            onChange={set("password")}
            autoComplete="new-password"
          />
          <PasswordRules value={form.password} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cf">Confirmer le mot de passe</Label>
          <PasswordInput
            id="cf"
            value={form.confirm}
            onChange={set("confirm")}
            autoComplete="new-password"
          />
        </div>
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={form.consent}
            onCheckedChange={(v) => setForm({ ...form, consent: v === true })}
            className="mt-0.5"
          />
          <span>
            J'accepte que mes données de santé soient traitées par MedLink conformément à la loi
            organique n° 2004-63 sur la protection des données personnelles. <PrivacyPolicyDialog />
          </span>
        </label>
        <Button type="submit" className="h-11 w-full" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />} Créer mon compte
        </Button>
      </form>
    </AuthLayout>
  );
}
