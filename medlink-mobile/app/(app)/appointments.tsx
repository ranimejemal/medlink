import { Alert, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, EmptyState, ErrorText, Header, Screen, StatusBadge } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { getUserId } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { colors, font } from "@/constants/theme";

export default function Appointments() {
  const router = useRouter();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["appointments"],
    queryFn: async () => {
      const uid = await getUserId();
      const { data, error } = await supabase.from("appointments").select("*")
        .eq("patient_id", uid).order("starts_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("appointments").update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["appointments"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); },
    onError: (e) => Alert.alert("Erreur", (e as Error).message),
  });

  const confirmCancel = (id: string) =>
    Alert.alert("Annuler le rendez-vous ?", "Cette action est définitive.", [
      { text: "Non", style: "cancel" },
      { text: "Oui, annuler", style: "destructive", onPress: () => cancel.mutate(id) },
    ]);

  const list = q.data ?? [];
  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Header title="Mes rendez-vous" />
      <Button title="Prendre rendez-vous" onPress={() => router.push("/book")} />
      <ErrorText error={q.error} />
      {list.length === 0 && !q.isLoading ? <EmptyState title="Aucun rendez-vous" /> : null}
      {list.map((a) => (
        <Card key={a.id}>
          <Text style={{ fontFamily: font.semibold, fontSize: 16 }}>{fmtDateTime(a.starts_at)}</Text>
          {a.reason ? <Text style={{ fontFamily: font.regular, color: colors.muted }}>{a.reason}</Text> : null}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <StatusBadge status={a.status} />
            {["scheduled", "confirmed"].includes(a.status) && new Date(a.starts_at) > new Date() ? (
              <Text onPress={() => confirmCancel(a.id)} style={{ color: colors.danger, fontFamily: font.semibold }}>Annuler</Text>
            ) : null}
          </View>
        </Card>
      ))}
    </Screen>
  );
}
