import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { Button, Card, ErrorText, Field, Screen } from "@/components/ui";
import { PasswordField } from "@/components/password-field";
import { signInPatient, signInWithGoogle } from "@/lib/auth";
import { markUnlocked } from "@/lib/biometric";
import { colors, font } from "@/constants/theme";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function submit() {
    setLoading(true); setError(null);
    try {
      await signInPatient(email.trim(), password);
      markUnlocked();
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (/not confirmed/i.test(msg)) {
        // Compte créé mais email pas encore confirmé : saisie du code
        router.push({ pathname: "/(auth)/verify-email", params: { email: email.trim() } });
      } else {
        setError(e as Error);
      }
    } finally {
      setLoading(false);
    }
  }

  async function google() {
    setGoogleLoading(true); setError(null);
    try {
      const session = await signInWithGoogle();
      if (session) markUnlocked();
    } catch (e) {
      setError(e as Error);
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <Screen>
      <View style={{ alignItems: "center", gap: 8, marginTop: 40, marginBottom: 12 }}>
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: colors.navy, alignItems: "center", justifyContent: "center" }}>
          <Plus color="#fff" size={28} />
        </View>
        <Text style={{ fontFamily: font.bold, fontSize: 24, letterSpacing: 3, color: colors.navy }}>MEDLINK</Text>
        <Text style={{ fontFamily: font.regular, color: colors.muted }}>Portail médical sécurisé</Text>
      </View>

      <Card style={{ gap: 14 }}>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <PasswordField label="Mot de passe" value={password} onChangeText={setPassword} autoComplete="password" />

        <Pressable onPress={() => router.push("/(auth)/forgot-password")} hitSlop={8} style={{ alignSelf: "flex-end" }}>
          <Text style={{ fontFamily: font.semibold, color: colors.navy }}>Mot de passe oublié ?</Text>
        </Pressable>

        <ErrorText error={error} />
        <Button title="Se connecter" onPress={submit} loading={loading} disabled={!email || !password} />

        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          <Text style={{ fontFamily: font.regular, color: colors.muted }}>ou</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        </View>

        <Button variant="outline" title="Continuer avec Google" onPress={google} loading={googleLoading} />
        <Button variant="outline" title="Créer un compte patient" onPress={() => router.push("/(auth)/register")} />
      </Card>
    </Screen>
  );
}
