import { useEffect, useState } from "react";
import { Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, Card, ErrorText, Field, Header, Screen } from "@/components/ui";
import { PasswordField } from "@/components/password-field";
import { sendPasswordResetCode, setNewPassword, verifyRecoveryCode } from "@/lib/auth";
import { markUnlocked } from "@/lib/biometric";
import { recovery } from "@/lib/recovery";
import { colors, font } from "@/constants/theme";

export default function ResetPassword() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = String(params.email ?? "");
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // En quittant l'écran, le garde d'authentification reprend son rôle normal
  useEffect(() => () => { recovery.active = false; }, []);

  async function verify() {
    setLoading(true); setError(null); setInfo(null);
    recovery.active = true; // la session de récupération ne doit pas rediriger vers l'accueil
    try {
      await verifyRecoveryCode(email, code.trim());
      setVerified(true);
    } catch (e) {
      recovery.active = false;
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setError(null);
    if (pwd.length < 8) return setError(new Error("8 caractères minimum."));
    if (pwd !== pwd2) return setError(new Error("Les mots de passe ne correspondent pas."));
    setLoading(true);
    try {
      await setNewPassword(pwd);
      markUnlocked();
      recovery.active = false;
      router.replace("/(app)");
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setError(null); setInfo(null);
    try {
      await sendPasswordResetCode(email);
      setInfo("Un nouveau code vient d'être envoyé. Utilise le dernier email reçu.");
    } catch (e) {
      setError(e as Error);
    }
  }

  if (!email) {
    return (
      <Screen>
        <Header title="Nouveau mot de passe" />
        <Card style={{ gap: 14 }}>
          <Text style={{ fontFamily: font.regular, color: colors.muted }}>
            Email manquant. Recommence depuis « Mot de passe oublié ».
          </Text>
          <Button title="Mot de passe oublié" onPress={() => router.replace("/(auth)/forgot-password")} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header
        title="Nouveau mot de passe"
        subtitle={verified ? "Choisissez votre nouveau mot de passe." : `Saisissez le code reçu à ${email}.`}
      />
      <Card style={{ gap: 14 }}>
        {!verified ? (
          <>
            <Field
              label="Code reçu par email"
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
            <Button title="Valider le code" onPress={verify} loading={loading} disabled={code.length < 6} />
            <Button variant="outline" title="Renvoyer le code" onPress={resend} />
          </>
        ) : (
          <>
            <PasswordField label="Nouveau mot de passe" value={pwd} onChangeText={setPwd} />
            <PasswordField label="Confirmer" value={pwd2} onChangeText={setPwd2} />
            <ErrorText error={error} />
            <Button title="Enregistrer" onPress={save} loading={loading} disabled={!pwd || !pwd2} />
          </>
        )}
        <Button variant="outline" title="Retour à la connexion" onPress={() => router.replace("/(auth)/login")} />
      </Card>
    </Screen>
  );
}
