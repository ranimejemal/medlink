import { useEffect, useState } from "react";
import { Alert, Switch, Text, View } from "react-native";
import { Button, Card, ErrorText, Field, Screen } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { canUseBiometric, isBiometricEnabled, setBiometricEnabled } from "@/lib/biometric";
import { font } from "@/constants/theme";

export default function Security() {
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [bio, setBio] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);

  useEffect(() => {
    isBiometricEnabled().then(setBio);
    canUseBiometric().then(setBioAvailable);
  }, []);

  async function changePassword() {
    setError(null);
    if (pwd.length < 8) return setError(new Error("8 caractères minimum."));
    if (pwd !== pwd2) return setError(new Error("Les mots de passe ne correspondent pas."));
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setLoading(false);
    if (error) return setError(error);
    setPwd(""); setPwd2("");
    Alert.alert("Mot de passe modifié");
  }

  return (
    <Screen>
      <Card style={{ gap: 14 }}>
        <Text style={{ fontFamily: font.bold, fontSize: 17 }}>Changer le mot de passe</Text>
        <Field label="Nouveau mot de passe" value={pwd} onChangeText={setPwd} secureTextEntry />
        <Field label="Confirmer" value={pwd2} onChangeText={setPwd2} secureTextEntry />
        <ErrorText error={error} />
        <Button title="Modifier" onPress={changePassword} loading={loading} />
      </Card>

      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontFamily: font.semibold, flex: 1 }}>Verrouillage Face ID / empreinte</Text>
          <Switch
            value={bio}
            disabled={!bioAvailable}
            onValueChange={async (v) => { await setBiometricEnabled(v); setBio(v); }}
          />
        </View>
        {!bioAvailable ? <Text style={{ fontFamily: font.regular, fontSize: 12 }}>Aucune biométrie configurée sur cet appareil.</Text> : null}
      </Card>

      <Button
        variant="danger"
        title="Déconnecter tous mes appareils"
        onPress={() => supabase.auth.signOut({ scope: "global" })}
      />
    </Screen>
  );
}
