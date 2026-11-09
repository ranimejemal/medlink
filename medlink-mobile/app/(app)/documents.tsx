import { Alert, Text } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, EmptyState, ErrorText, Header, Screen } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { getUserId } from "@/lib/auth";
import { openStoredFile } from "@/lib/storage";
import { fmtDate } from "@/lib/format";
import { colors, font } from "@/constants/theme";

const BUCKET = "documents"; // adapte au nom de ton bucket

export default function Documents() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const uid = await getUserId();
      const { data, error } = await supabase.from("documents").select("*")
        .eq("patient_id", uid).order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const upload = useMutation({
    mutationFn: async () => {
      const pick = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (pick.canceled) return;
      const file = pick.assets[0];
      if (file.size && file.size > 10 * 1024 * 1024) throw new Error("Fichier trop volumineux (10 Mo max).");
      const uid = await getUserId();
      const safeName = file.name.replace(/[^\w.\-]/g, "_");
      const path = `${uid}/${Date.now()}-${safeName}`;
      const body = await (await fetch(file.uri)).arrayBuffer();
      const { error } = await supabase.storage.from(BUCKET)
        .upload(path, body, { contentType: file.mimeType ?? "application/octet-stream" });
      if (error) throw error;
      const { error: e2 } = await supabase.from("documents").insert({ patient_id: uid, name: file.name, file_path: path });
      if (e2) throw e2;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
    onError: (e) => Alert.alert("Erreur", (e as Error).message),
  });

  const open = async (path: string) => {
    try { await openStoredFile(BUCKET, path); } catch (e) { Alert.alert("Erreur", (e as Error).message); }
  };

  const list = q.data ?? [];
  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Header title="Mes documents" />
      <Button title="Ajouter un document" onPress={() => upload.mutate()} loading={upload.isPending} />
      <ErrorText error={q.error} />
      {list.length === 0 && !q.isLoading ? <EmptyState title="Aucun document" /> : null}
      {list.map((d) => (
        <Card key={d.id}>
          <Text style={{ fontFamily: font.semibold }}>{d.name}</Text>
          <Text style={{ fontFamily: font.regular, color: colors.muted }}>{fmtDate(d.created_at)}</Text>
          <Text onPress={() => open(d.file_path)} style={{ color: colors.navy, fontFamily: font.semibold }}>Ouvrir</Text>
        </Card>
      ))}
    </Screen>
  );
}
