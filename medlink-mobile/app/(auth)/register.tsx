import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Check } from "lucide-react-native";
import { Button, Card, ErrorText, Field, Header, Screen } from "@/components/ui";
import { PasswordField } from "@/components/password-field";
import { signUpPatient } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";
import { colors, font } from "@/constants/theme";

export default function Register() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const phoneOk = normalizePhone(phone) !== null;

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const { needsCode } = await signUpPatient(fullName, email, password, consent, phone);
      if (needsCode) {
        router.replace({ pathname: "/(auth)/verify-email", params: { email: email.trim() } });
      }
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
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <Field
          label="Téléphone (rappels par SMS)"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          placeholder="22 123 456 ou +33 6 12 34 56 78"
        />
        {phone.length > 0 && !phoneOk ? (
          <Text style={{ fontFamily: font.regular, color: colors.danger, fontSize: 12 }}>
            Numéro invalide.
          </Text>
        ) : null}
        <PasswordField
          label="Mot de passe (8 caractères min.)"
          value={password}
          onChangeText={setPassword}
        />

        <Pressable
          onPress={() => setConsent((c) => !c)}
          style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              borderWidth: 1.5,
              marginTop: 2,
              borderColor: consent ? colors.navy : colors.border,
              backgroundColor: consent ? colors.navy : "#fff",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {consent ? <Check color="#fff" size={14} /> : null}
          </View>
          <Text style={{ flex: 1, fontFamily: font.regular, color: colors.text, fontSize: 13 }}>
            J'accepte que MedLink traite mes données personnelles et de santé pour la gestion de mes
            rendez-vous, et utilise mon numéro uniquement pour m'envoyer des rappels de rendez-vous
            par SMS. Je peux exporter ou supprimer mes données à tout moment.
          </Text>
        </Pressable>

        <ErrorText error={error} />
        <Button
          title="S'inscrire"
          onPress={submit}
          loading={loading}
          disabled={
            !fullName.trim() || !email.includes("@") || !phoneOk || password.length < 8 || !consent
          }
        />
        <Button
          variant="outline"
          title="J'ai déjà un compte"
          onPress={() => router.replace("/(auth)/login")}
        />
      </Card>
    </Screen>
  );
}
