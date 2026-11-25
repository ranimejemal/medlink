import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Chip, EmptyState, ErrorText, Header, Screen } from "@/components/ui";
import { StatusBadge } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { cancelAppointment } from "@/lib/practitioners";
import { syncReminders } from "@/lib/reminders";
import { fmtDateTime } from "@/lib/format";
import { colors, font } from "@/constants/theme";

// Règle des 24 h, comme sur le web
const canChange = (startsAt: string) =>
  new Date(startsAt).getTime() - Date.now() > 24 * 60 * 60 * 1000;

export default function Appointments() {
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

  const q = useQuery({
    queryKey: ["appointments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelAppointment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["slots"] });
      syncReminders();
    },
    onError: (e) => Alert.alert("Erreur", (e as Error).message),
  });

  function confirmCancel(id: string) {
    Alert.alert("Annuler ce rendez-vous ?", "Cette action est définitive.", [
      { text: "Retour", style: "cancel" },
      { text: "Annuler le rendez-vous", style: "destructive", onPress: () => cancel.mutate(id) },
    ]);
  }

  const now = new Date();
  const all = q.data ?? [];
  const upcoming = all.filter(
    (a) => ["scheduled", "confirmed"].includes(a.status) && new Date(a.starts_at) > now,
  );
  const past = all
    .filter((a) => !upcoming.includes(a))
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const list = tab === "upcoming" ? upcoming : past;

  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Header title="Mes rendez-vous" />
      <Button title="Prendre rendez-vous" onPress={() => router.push("/book")} />

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Chip
          label={`À venir (${upcoming.length})`}
          selected={tab === "upcoming"}
          onPress={() => setTab("upcoming")}
        />
        <Chip
          label={`Passés et annulés (${past.length})`}
          selected={tab === "past"}
          onPress={() => setTab("past")}
        />
      </View>

      <ErrorText error={q.error} />
      {list.length === 0 && !q.isLoading ? <EmptyState title="Aucun rendez-vous" /> : null}

      {list.map((a) => (
        <Card key={a.id}>
          <Text style={{ fontFamily: font.semibold, fontSize: 16 }}>
            {fmtDateTime(a.starts_at)}
          </Text>
          {a.reason ? (
            <Text style={{ fontFamily: font.regular, color: colors.muted }}>{a.reason}</Text>
          ) : null}
          <View
            style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
          >
            <StatusBadge status={a.status} />
            {tab === "upcoming" && canChange(a.starts_at) ? (
              <View style={{ flexDirection: "row", gap: 16 }}>
                <Text
                  onPress={() => router.push({ pathname: "/reschedule", params: { id: a.id } })}
                  style={{ color: colors.navy, fontFamily: font.semibold }}
                >
                  Reporter
                </Text>
                <Text
                  onPress={() => confirmCancel(a.id)}
                  style={{ color: colors.danger, fontFamily: font.semibold }}
                >
                  Annuler
                </Text>
              </View>
            ) : null}
          </View>
        </Card>
      ))}
    </Screen>
  );
}