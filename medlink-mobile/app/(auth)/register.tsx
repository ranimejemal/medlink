import { useState } from "react";
import { useRouter } from "expo-router";
import { Button, Card, ErrorText, Field, Header, Screen } from "@/components/ui";
import { PasswordField } from "@/components/password-field";
import { signUpPatient } from "@/lib/auth";

export default function Register() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function submit() {
    setLoading(true); setError(null);
    try {
      const { needsCode } = await signUpPatient(fullName, email, password);
      if (needsCode) {
        router.replace({ pathname: "/(auth)/verify-email", params: { email: email.trim() } });
      }
      // sinon : la session existe déjà et le garde redirige vers l'accueil
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Header title="Créer un compte" subtitle="Espace patient" />
      <Card style={{ gap: 14 }}>
        <Field label="Nom complet" value={fullName} onChangeText={setFullName} />
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <PasswordField label="Mot de passe (8 caractères min.)" value={password} onChangeText={setPassword} />
        <ErrorText error={error} />
        <Button title="S'inscrire" onPress={submit} loading={loading} disabled={!fullName.trim() || !email.includes("@") || password.length < 8} />
        <Button variant="outline" title="J'ai déjà un compte" onPress={() => router.replace("/(auth)/login")} />
      </Card>
    </Screen>
  );
}
