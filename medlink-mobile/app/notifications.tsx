import { Text } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, EmptyState, ErrorText, Screen } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { getUserId } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { colors, font } from "@/constants/theme";

export default function Notifications() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const uid = await getUserId();
      const { data, error } = await supabase.from("notifications").select("*")
        .eq("user_id", uid).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data as any[];
    },
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notifications").update({ read: true }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const list = q.data ?? [];
  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <ErrorText error={q.error} />
      {list.length === 0 && !q.isLoading ? <EmptyState title="Aucune notification" /> : null}
      {list.map((n) => (
        <Card key={n.id} style={{ opacity: n.read ? 0.6 : 1 }}>
          <Text onPress={() => !n.read && markRead.mutate(n.id)} style={{ fontFamily: font.semibold }}>{n.title}</Text>
          {n.body ? <Text style={{ fontFamily: font.regular, color: colors.muted }}>{n.body}</Text> : null}
          <Text style={{ fontFamily: font.regular, color: colors.muted, fontSize: 12 }}>{fmtDateTime(n.created_at)}</Text>
        </Card>
      ))}
    </Screen>
  );
}
