import { useEffect, useState } from "react";
import { Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, Card, ErrorText, Field, Header, Screen } from "@/components/ui";
import { resendSignupCode, verifySignupCode } from "@/lib/auth";
import { markUnlocked } from "@/lib/biometric";
import { colors, font } from "@/constants/theme";

export default function VerifyEmail() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = String(params.email ?? "");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function verify() {
    setLoading(true); setError(null); setInfo(null);
    try {
      await verifySignupCode(email, code.trim());
      markUnlocked(); // la session est créée : le garde redirige vers l'accueil
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setError(null); setInfo(null);
    try {
      await resendSignupCode(email);
      setInfo("Un nouveau code vient d'être envoyé. Utilise le dernier email reçu.");
      setCooldown(60);
    } catch (e) {
      setError(e as Error);
    }
  }

  return (
    <Screen>
      <Header title="Vérifiez votre email" subtitle={email ? `Saisissez le code reçu à ${email}.` : "Saisissez le code reçu par email."} />
      <Card style={{ gap: 14 }}>
        <Field
          label="Code de vérification"
          value={code}
          onChangeText={(t) => setCode(t.replace(/\D/g, ""))}
          keyboardType="number-pad"
          maxLength={10}
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          placeholder="123456"
        />
        <ErrorText error={error} />
        {info ? <Text style={{ color: colors.success, fontFamily: font.medium }}>{info}</Text> : null}
        <Button title="Valider" onPress={verify} loading={loading} disabled={code.length < 6 || !email} />
        <Button
          variant="outline"
          title={cooldown > 0 ? `Renvoyer le code (${cooldown}s)` : "Renvoyer le code"}
          onPress={resend}
          disabled={cooldown > 0 || !email}
        />
        <Button variant="outline" title="Retour à la connexion" onPress={() => router.replace("/(auth)/login")} />
      </Card>
    </Screen>
  );
}
