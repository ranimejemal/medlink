import { useEffect, useState } from "react";
import { Alert, Switch, Text, View } from "react-native";
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
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [sms, setSms] = useState(false);

  const q = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const uid = await getUserId();
      const { data, error } = await supabase
        .from("profiles")
        .select("first_name, last_name, phone, notify_sms")
        .eq("id", uid)
        .single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (q.data) {
      setFirst(q.data.first_name ?? "");
      setLast(q.data.last_name ?? "");
      setPhone(q.data.phone ?? "");
      setSms(!!q.data.notify_sms);
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const uid = await getUserId();
      let normalized: string | null = null;
      if (phone.trim()) {
        normalized = normalizePhone(phone);
        if (!normalized) throw new Error("Numéro invalide. Exemple : 22 123 456 ou +33 6 12 34 56 78.");
      }
      if (sms && !normalized) throw new Error("Saisissez un numéro pour recevoir les rappels par SMS.");
      const { error } = await supabase
        .from("profiles")
        .update({ first_name: first.trim(), last_name: last.trim(), phone: normalized, notify_sms: sms })
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
        <Field label="Prénom" value={first} onChangeText={setFirst} />
        <Field label="Nom" value={last} onChangeText={setLast} />
        <Field
          label="Téléphone"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          placeholder="22 123 456 ou +33 6 12 34 56 78"
        />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Text style={{ flex: 1, fontFamily: font.medium, color: colors.text }}>
            Recevoir les rappels de rendez-vous par SMS
          </Text>
          <Switch value={sms} onValueChange={setSms} />
        </View>
        <Text style={{ fontFamily: font.regular, color: colors.muted, fontSize: 12 }}>
          Le numéro sert uniquement aux rappels de rendez-vous. Désactivez l'option à tout moment.
        </Text>
        <ErrorText error={q.error ?? save.error} />
        <Button title="Enregistrer" onPress={() => save.mutate()} loading={save.isPending} />
      </Card>
      <Button variant="outline" title="Mes données (export et suppression)" onPress={() => router.push("/privacy")} />
      <Button variant="outline" title="Sécurité" onPress={() => router.push("/security")} />
      <Button variant="danger" title="Se déconnecter" onPress={logout} />
    </Screen>
  );
}