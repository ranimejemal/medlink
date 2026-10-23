import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { AuthLayout } from "@/components/medlink/AuthLayout";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { supabase } from "@/integrations/supabase/client";
import { homeFor, loadAccess } from "@/lib/access";
import { logSecurityEvent } from "@/lib/auth.functions";

export const Route = createFileRoute("/mfa")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Double authentification — MedLink" },
      { name: "description", content: "Vérification en deux étapes par code TOTP." },
      { property: "og:title", content: "Double authentification — MedLink" },
      { property: "og:description", content: "Vérification TOTP MedLink." },
    ],
  }),
  beforeLoad: async () => {
    const access = await loadAccess();
    if (!access) throw redirect({ to: "/login" });
    return { access };
  },
  component: MfaPage,
});

function MfaPage() {
  const { access } = Route.useRouteContext();
  const navigate = useNavigate();
  const log = useServerFn(logSecurityEvent);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const enrolling = !access.mfaEnrolled;

  useEffect(() => {
    if (access.aal === "aal2") { navigate({ to: homeFor(access.roles) }); return; }
    (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      const verified = data?.totp.find((f) => f.status === "verified");
      if (verified) return setFactorId(verified.id);
      // clean up abandoned unverified factors, then enroll a new one
      for (const f of data?.all ?? []) if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data: en, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `MedLink ${Date.now()}` });
      if (error || !en) return setError("Impossible d'initialiser la double authentification.");
      setFactorId(en.id);
      setQr(en.totp.qr_code);
      setSecret(en.totp.secret);
    })();
  }, [access, navigate]);

  const verify = async () => {
    if (!factorId || code.length !== 6) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    setLoading(false);
    if (error) {
      setCode("");
      try { await log({ data: { action: "mfa.failed" } }); } catch { /* ignore */ }
      return setError("Code invalide ou expiré. Réessayez.");
    }
    try { await log({ data: { action: enrolling ? "mfa.enrolled" : "mfa.verified" } }); } catch { /* ignore */ }
    navigate({ to: homeFor(access.roles) });
  };

  const cancel = async () => { await supabase.auth.signOut(); navigate({ to: "/login" }); };

  return (
    <AuthLayout
      title={enrolling ? "Activer la double authentification" : "Vérification en deux étapes"}
      subtitle={enrolling ? "Obligatoire pour les praticiens et administrateurs." : "Saisissez le code à 6 chiffres de votre application d'authentification."}
      footer={<button onClick={cancel} className="font-medium text-primary hover:underline">Annuler et se déconnecter</button>}
    >
      <div className="space-y-5">
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {enrolling && (
          <div className="card-surface p-5">
            <div className="flex items-center gap-2 text-sm font-medium"><Smartphone className="h-4 w-4 text-info" /> Scannez ce QR code avec Google Authenticator, Microsoft Authenticator ou FreeOTP</div>
            <div className="mt-4 flex justify-center">
              {qr ? <img src={qr} alt="QR code TOTP" className="h-44 w-44 rounded-lg border bg-card p-2" /> : <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />}
            </div>
            {secret && <p className="mt-3 break-all text-center text-xs text-muted-foreground">Clé manuelle : <span className="font-mono">{secret}</span></p>}
          </div>
        )}
        <div className="flex flex-col items-center gap-4">
          <InputOTP maxLength={6} value={code} onChange={setCode} onComplete={verify} inputMode="numeric">
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} className="h-12 w-11 text-lg" />)}
            </InputOTPGroup>
          </InputOTP>
          <Button onClick={verify} className="h-11 w-full" disabled={loading || code.length !== 6 || !factorId}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Vérifier
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}
