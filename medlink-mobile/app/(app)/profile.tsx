import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, ErrorText, Field, Header, Screen } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { getUserId } from "@/lib/auth";

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
    if (q.data) { setFullName(q.data.full_name ?? ""); setPhone(q.data.phone ?? ""); }
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      const uid = await getUserId();
      const { error } = await supabase.from("profiles")
        .update({ full_name: fullName.trim(), phone: phone.trim() || null }).eq("id", uid);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["profile"] }); Alert.alert("Profil mis à jour"); },
  });

  const logout = async () => { await supabase.auth.signOut(); qc.clear(); };

  return (
    <Screen>
      <Header title="Mon profil" />
      <Card style={{ gap: 14 }}>
        <Field label="Nom complet" value={fullName} onChangeText={setFullName} />
        <Field label="Téléphone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <ErrorText error={q.error ?? save.error} />
        <Button title="Enregistrer" onPress={() => save.mutate()} loading={save.isPending} />
      </Card>
      <Button variant="outline" title="Sécurité" onPress={() => router.push("/security")} />
      <Button variant="danger" title="Se déconnecter" onPress={logout} />
    </Screen>
  );
}
