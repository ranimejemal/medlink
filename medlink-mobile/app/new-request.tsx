import { useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, ErrorText, Field, Header, Screen } from "@/components/ui";
import { createRequest } from "@/lib/requests";

export default function NewRequest() {
  const router = useRouter();
  const qc = useQueryClient();
  const [text, setText] = useState("");

  const send = useMutation({
    mutationFn: () => createRequest(text),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      Alert.alert("Demande envoyée", "Notre équipe vous recontactera.");
      router.back();
    },
  });

  return (
    <Screen>
      <Header
        title="Décrire mon besoin"
        subtitle="Ne saisissez aucune information médicale urgente : en cas d'urgence, appelez les secours."
      />
      <Field
        label="Votre besoin"
        value={text}
        onChangeText={setText}
        multiline
        numberOfLines={6}
        style={{ minHeight: 140, textAlignVertical: "top" }}
      />
      <ErrorText error={send.error} />
      <Button
        title="Envoyer"
        onPress={() => send.mutate()}
        loading={send.isPending}
        disabled={text.trim().length < 10}
      />
    </Screen>
  );
}
