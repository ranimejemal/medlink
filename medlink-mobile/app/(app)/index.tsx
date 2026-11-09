import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, CalendarDays, ClipboardList, Sparkles } from "lucide-react-native";
import { Button, Card, EmptyState, ErrorText, Header, Screen, StatCard, StatusBadge } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { getUserId } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { colors, font } from "@/constants/theme";

export default function Dashboard() {
  const router = useRouter();
  const q = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const uid = await getUserId();
      const [a, r] = await Promise.all([
        supabase.from("appointments").select("*").eq("patient_id", uid)
          .gte("starts_at", new Date().toISOString()).in("status", ["scheduled", "confirmed"])
          .order("starts_at").limit(5),
        supabase.from("appointment_requests").select("*").eq("patient_id", uid)
          .order("created_at", { ascending: false }).limit(5),
      ]);
      if (a.error) throw a.error;
      if (r.error) throw r.error;
      return { appts: a.data as any[], reqs: r.data as any[] };
    },
  });

  const appts = q.data?.appts ?? [];
  const reqs = q.data?.reqs ?? [];

  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}><Header title="Tableau de bord" subtitle="Vos prochains rendez-vous et vos demandes." /></View>
        <Pressable onPress={() => router.push("/notifications")} hitSlop={12}><Bell color={colors.navy} size={24} /></Pressable>
      </View>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <StatCard icon={<CalendarDays color={colors.navy} size={20} />} label="RDV à venir" value={appts.length} />
        <StatCard icon={<ClipboardList color={colors.navy} size={20} />} label="En attente" value={reqs.filter((r) => r.status === "pending").length} />
      </View>

      <Button title="Nouvelle demande" onPress={() => router.push("/new-request")} />
      <ErrorText error={q.error} />

      <Card>
        <Text style={{ fontFamily: font.bold, fontSize: 17 }}>Prochains rendez-vous</Text>
        {appts.length === 0 ? (
          <EmptyState title="Aucun rendez-vous à venir" actionLabel="Prendre rendez-vous" onAction={() => router.push("/book")} />
        ) : appts.map((a) => (
          <View key={a.id} style={{ paddingVertical: 8, gap: 2 }}>
            <Text style={{ fontFamily: font.semibold }}>{fmtDateTime(a.starts_at)}</Text>
            {a.reason ? <Text style={{ fontFamily: font.regular, color: colors.muted }}>{a.reason}</Text> : null}
            <StatusBadge status={a.status} />
          </View>
        ))}
      </Card>

      <Card>
        <Text style={{ fontFamily: font.bold, fontSize: 17 }}>Mes demandes de rendez-vous</Text>
        {reqs.length === 0 ? (
          <EmptyState title="Aucune demande" subtitle="Décrivez votre besoin, notre équipe vous recontactera." actionLabel="Décrire mon besoin" onAction={() => router.push("/new-request")} />
        ) : reqs.map((r) => (
          <View key={r.id} style={{ paddingVertical: 8, gap: 2 }}>
            <Text style={{ fontFamily: font.medium }} numberOfLines={2}>{r.description}</Text>
            <StatusBadge status={r.status} />
          </View>
        ))}
      </Card>

      <Text style={{ fontFamily: font.regular, color: colors.muted, fontSize: 12, textAlign: "center" }}>
        <Sparkles color={colors.muted} size={12} /> Données de démonstration fictives
      </Text>
    </Screen>
  );
}
