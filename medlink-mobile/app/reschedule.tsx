import { useMemo, useState } from "react";
import { Alert, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator } from "react-native";
import { Button, Card, Chip, ErrorText, Screen } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { fetchUpcomingSlots, rescheduleAppointment, Slot } from "@/lib/practitioners";
import { syncReminders } from "@/lib/reminders";
import { colors, font } from "@/constants/theme";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const dayKey = (d: Date) => d.toDateString();
const dayTitle = (d: Date) =>
  cap(d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }));
const timeLabel = (d: Date) =>
  d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export default function Reschedule() {
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [slot, setSlot] = useState<Slot | null>(null);

  // Le rendez-vous actuel (donne le praticien et la date actuelle)
  const appt = useQuery({
    queryKey: ["appointment", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id,practitioner_id,starts_at")
        .eq("id", String(id))
        .single();
      if (error) throw error;
      return data as { id: string; practitioner_id: string; starts_at: string };
    },
  });

  const practitionerId = appt.data?.practitioner_id;

  const slots = useQuery({
    queryKey: ["slots", practitionerId],
    enabled: !!practitionerId,
    queryFn: () => fetchUpcomingSlots(String(practitionerId)),
  });

  const groups = useMemo(() => {
    const map = new Map<string, { date: Date; items: Slot[] }>();
    for (const s of slots.data ?? []) {
      const k = dayKey(s.startsAt);
      if (!map.has(k)) map.set(k, { date: s.startsAt, items: [] });
      map.get(k)!.items.push(s);
    }
    return [...map.values()];
  }, [slots.data]);

  const move = useMutation({
    mutationFn: () => rescheduleAppointment(String(id), slot!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["slots"] });
      syncReminders();
      Alert.alert("Rendez-vous reporté", "Votre rendez-vous a été déplacé.");
      router.back();
    },
    onError: () => {
      // créneau pris entre-temps : on recharge la liste et on désélectionne
      setSlot(null);
      qc.invalidateQueries({ queryKey: ["slots"] });
    },
  });

  const loading = appt.isLoading || slots.isLoading;

  return (
    <Screen>
      <Card style={{ gap: 12 }}>
        <Text style={{ fontFamily: font.bold, fontSize: 17 }}>Reporter le rendez-vous</Text>
        {appt.data ? (
          <Text style={{ fontFamily: font.regular, color: colors.muted }}>
            Actuellement le{" "}
            {new Date(appt.data.starts_at).toLocaleString("fr-FR", {
              dateStyle: "full",
              timeStyle: "short",
            })}
            . Choisissez un nouveau créneau avec le même praticien.
          </Text>
        ) : null}

        <ErrorText error={appt.error} />
        <ErrorText error={slots.error} />
        {loading ? <ActivityIndicator color={colors.navy} /> : null}

        {!loading && !slots.error && groups.length === 0 ? (
          <Text style={{ color: colors.muted, fontFamily: font.regular }}>
            Aucun créneau disponible pour le moment.
          </Text>
        ) : null}

        {groups.map((g) => (
          <View key={dayKey(g.date)} style={{ gap: 8 }}>
            <Text style={{ fontFamily: font.semibold }}>{dayTitle(g.date)}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {g.items.map((s) => (
                <Chip
                  key={s.id}
                  label={timeLabel(s.startsAt)}
                  selected={slot?.id === s.id}
                  onPress={() => setSlot(s)}
                />
              ))}
            </View>
          </View>
        ))}
      </Card>

      <ErrorText error={move.error} />
      <Button
        title="Confirmer le report"
        onPress={() => move.mutate()}
        loading={move.isPending}
        disabled={!slot}
      />
    </Screen>
  );
}