import { useState } from "react";
import { useRouter } from "expo-router";
import { Button, Card, ErrorText, Field, Header, Screen } from "@/components/ui";
import { sendPasswordResetCode } from "@/lib/auth";

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function submit() {
    setLoading(true); setError(null);
    try {
      await sendPasswordResetCode(email);
      router.push({ pathname: "/(auth)/reset-password", params: { email: email.trim() } });
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Header title="Mot de passe oublié" subtitle="Saisissez votre email pour recevoir un code de réinitialisation." />
      <Card style={{ gap: 14 }}>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <ErrorText error={error} />
        <Button title="Envoyer le code" onPress={submit} loading={loading} disabled={!email.includes("@")} />
        <Button variant="outline" title="Retour à la connexion" onPress={() => router.replace("/(auth)/login")} />
      </Card>
    </Screen>
  );
}
