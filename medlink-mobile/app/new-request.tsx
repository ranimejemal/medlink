import { useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, ErrorText, Field, Header, Screen } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { getUserId } from "@/lib/auth";

export default function NewRequest() {
  const router = useRouter();
  const qc = useQueryClient();
  const [description, setDescription] = useState("");

  const send = useMutation({
    mutationFn: async () => {
      const uid = await getUserId();
      const { error } = await supabase.from("appointment_requests")
        .insert({ patient_id: uid, description: description.trim(), status: "pending" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      Alert.alert("Demande envoyée", "Notre équipe vous recontactera.");
      router.back();
    },
  });

  return (
    <Screen>
      <Header title="Décrire mon besoin" subtitle="Ne saisissez aucune information médicale urgente : en cas d'urgence, appelez les secours." />
      <Field label="Votre besoin" value={description} onChangeText={setDescription} multiline numberOfLines={6} style={{ minHeight: 140, textAlignVertical: "top" }} />
      <ErrorText error={send.error} />
      <Button title="Envoyer" onPress={() => send.mutate()} loading={send.isPending} disabled={description.trim().length < 10} />
    </Screen>
  );
}
