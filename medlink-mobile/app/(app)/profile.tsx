import { useEffect, useState } from "react";
import { Alert, Text } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, ErrorText, Field, Header, Screen } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { getUserId } from "@/lib/auth";
import { clearReminders } from "@/lib/reminders";
import { normalizePhone } from "@/lib/phone";
import { colors, font } from "@/constants/theme";

export default function Profile() {
  const router = useRouter();
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  const q = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const uid = await getUserId();
      const { data, error } = await supabase.from("profiles").select("*").eq("id", uid).single();
      if (error) throw error;
      return data as any;
    },
  });

  useEffect(() => {
    if (q.data) {
      setFullName(q.data.full_name ?? "");
      setPhone(q.data.phone ?? "");
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const uid = await getUserId();
      let normalized: string | null = null;
      if (phone.trim()) {
        normalized = normalizePhone(phone);
        if (!normalized)
          throw new Error(
            "Numéro de téléphone invalide. Exemple : 22 123 456 ou +33 6 12 34 56 78.",
          );
      }
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName.trim(), phone: normalized })
        .eq("id", uid);
      if (error) throw error;
      setPhone(normalized ?? "");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      Alert.alert("Profil mis à jour");
    },
  });

  const logout = async () => {
    await clearReminders();
    await supabase.auth.signOut();
    qc.clear();
  };

  return (
    <Screen>
      <Header title="Mon profil" />
      <Card style={{ gap: 14 }}>
        <Field label="Nom complet" value={fullName} onChangeText={setFullName} />
        <Field
          label="Téléphone (rappels par SMS)"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          placeholder="22 123 456 ou +33 6 12 34 56 78"
        />
        <Text style={{ fontFamily: font.regular, color: colors.muted, fontSize: 12 }}>
          {phone.trim()
            ? "Les rappels de rendez-vous seront envoyés par SMS à ce numéro."
            : "Sans numéro, vous ne recevrez pas de rappel par SMS."}
        </Text>
        <ErrorText error={q.error ?? save.error} />
        <Button title="Enregistrer" onPress={() => save.mutate()} loading={save.isPending} />
      </Card>
      <Button
        variant="outline"
        title="Mes données (export et suppression)"
        onPress={() => router.push("/privacy")}
      />
      <Button variant="outline" title="Sécurité" onPress={() => router.push("/security")} />
      <Button variant="danger" title="Se déconnecter" onPress={logout} />
    </Screen>
  );
}
