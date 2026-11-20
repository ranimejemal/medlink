import { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Chip, ErrorText, Screen } from "@/components/ui";
import { fetchSlots, rescheduleAppointment, Slot } from "@/lib/practitioners";
import { syncReminders } from "@/lib/reminders";
import { colors, font } from "@/constants/theme";

const days = Array.from({ length: 14 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() + i);
  d.setHours(0, 0, 0, 0);
  return d;
});
const dayLabel = (d: Date) =>
  d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const timeLabel = (d: Date) =>
  d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

export default function Reschedule() {
  const router = useRouter();
  const qc = useQueryClient();
  const { id, practitionerId } = useLocalSearchParams<{ id: string; practitionerId: string }>();
  const [day, setDay] = useState<Date>(days[0]);
  const [slot, setSlot] = useState<Slot | null>(null);

  const slots = useQuery({
    queryKey: ["slots", practitionerId, day.toDateString()],
    queryFn: () => fetchSlots(String(practitionerId), day),
    enabled: !!practitionerId,
  });

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
  });

  return (
    <Screen>
      <Card style={{ gap: 12 }}>
        <Text style={{ fontFamily: font.bold, fontSize: 17 }}>Choisir un nouveau créneau</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {days.map((d) => (
            <Chip
              key={d.toISOString()}
              label={dayLabel(d)}
              selected={day.getTime() === d.getTime()}
              onPress={() => {
                setDay(d);
                setSlot(null);
              }}
            />
          ))}
        </ScrollView>
        <ErrorText error={slots.error} />
        {slots.data && slots.data.length === 0 ? (
          <Text style={{ color: colors.muted, fontFamily: font.regular }}>
            Aucun créneau disponible ce jour-là.
          </Text>
        ) : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(slots.data ?? []).map((s) => (
            <Chip
              key={s.id}
              label={timeLabel(s.startsAt)}
              selected={slot?.id === s.id}
              onPress={() => setSlot(s)}
            />
          ))}
        </View>
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
