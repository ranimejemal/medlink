import { Alert, Text } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Card, EmptyState, ErrorText, Header, Screen } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { getUserId } from "@/lib/auth";
import { openStoredFile } from "@/lib/storage";
import { fmtDate } from "@/lib/format";
import { colors, font } from "@/constants/theme";

export default function Results() {
  const q = useQuery({
    queryKey: ["results"],
    queryFn: async () => {
      const uid = await getUserId();
      const { data, error } = await supabase.from("lab_results").select("*")
        .eq("patient_id", uid).order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const open = async (path: string) => {
    try { await openStoredFile("results", path); } // adapte le nom du bucket
    catch (e) { Alert.alert("Erreur", (e as Error).message); }
  };

  const list = q.data ?? [];
  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Header title="Mes résultats" />
      <ErrorText error={q.error} />
      {list.length === 0 && !q.isLoading ? <EmptyState title="Aucun résultat disponible" /> : null}
      {list.map((r) => (
        <Card key={r.id}>
          <Text style={{ fontFamily: font.semibold, fontSize: 16 }}>{r.title}</Text>
          <Text style={{ fontFamily: font.regular, color: colors.muted }}>{fmtDate(r.created_at)}</Text>
          {r.file_path ? <Text onPress={() => open(r.file_path)} style={{ color: colors.navy, fontFamily: font.semibold }}>Ouvrir le PDF</Text> : null}
        </Card>
      ))}
    </Screen>
  );
}
