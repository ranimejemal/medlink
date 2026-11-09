import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react-native";
import { Button, Card, Chip, ErrorText, Field, Screen } from "@/components/ui";
import { bookAppointment, fetchFilters, fetchPractitioners, fetchSlots, Slot } from "@/lib/practitioners";
import { colors, font, radius } from "@/constants/theme";

const days = Array.from({ length: 14 }, (_, i) => {
  const d = new Date(); d.setDate(d.getDate() + i); d.setHours(0, 0, 0, 0); return d;
});
const dayLabel = (d: Date) => d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const timeLabel = (d: Date) => d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const small = { fontFamily: font.medium, color: colors.muted, fontSize: 12, textTransform: "uppercase" as const };

function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
      {children}
    </ScrollView>
  );
}

export default function Book() {
  const router = useRouter();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [specialtyId, setSpecialtyId] = useState<string | null>(null);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [practitionerId, setPractitionerId] = useState<string | null>(null);
  const [day, setDay] = useState<Date>(days[0]);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [reason, setReason] = useState("");

  const filters = useQuery({ queryKey: ["book-filters"], queryFn: fetchFilters });
  const practitioners = useQuery({ queryKey: ["practitioners"], queryFn: fetchPractitioners });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (practitioners.data ?? []).filter(
      (p) =>
        (!q || p.name.toLowerCase().includes(q)) &&
        (!specialtyId || p.specialtyId === specialtyId) &&
        (!clinicId || p.clinicId === clinicId)
    );
  }, [practitioners.data, search, specialtyId, clinicId]);

  const selected = (practitioners.data ?? []).find((p) => p.id === practitionerId) ?? null;

  const slots = useQuery({
    queryKey: ["slots", practitionerId, day.toDateString()],
    queryFn: () => fetchSlots(practitionerId!, day),
    enabled: !!practitionerId,
  });

  const book = useMutation({
    mutationFn: () => bookAppointment({ practitionerId: practitionerId!, slot: slot!, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["slots"] });
      Alert.alert("Rendez-vous demandé", "Il sera confirmé par le cabinet.");
      router.back();
    },
  });

  return (
    <Screen>
      <Text style={{ fontFamily: font.regular, color: colors.muted }}>
        Choisissez un praticien, un créneau, puis confirmez.
      </Text>

      <Card style={{ gap: 12 }}>
        <Text style={{ fontFamily: font.bold, fontSize: 17 }}>1. Trouver un praticien</Text>

        <View style={{
          flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.border,
          borderRadius: radius.md, paddingHorizontal: 12, backgroundColor: "#fff",
        }}>
          <Search color={colors.muted} size={18} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Rechercher un nom..."
            placeholderTextColor={colors.muted}
            style={{ flex: 1, paddingVertical: 12, fontFamily: font.regular, color: colors.text }}
          />
        </View>

        <Text style={small}>Spécialité</Text>
        <ChipRow>
          <Chip label="Toutes" selected={specialtyId === null} onPress={() => setSpecialtyId(null)} />
          {(filters.data?.specialties ?? []).map((s) => (
            <Chip key={s.id} label={s.name} selected={specialtyId === s.id} onPress={() => setSpecialtyId(s.id)} />
          ))}
        </ChipRow>

        <Text style={small}>Clinique</Text>
        <ChipRow>
          <Chip label="Toutes" selected={clinicId === null} onPress={() => setClinicId(null)} />
          {(filters.data?.clinics ?? []).map((c) => (
            <Chip key={c.id} label={c.name} selected={clinicId === c.id} onPress={() => setClinicId(c.id)} />
          ))}
        </ChipRow>

        <ErrorText error={practitioners.error ?? filters.error} />
        {practitioners.isLoading ? <Text style={{ color: colors.muted, fontFamily: font.regular }}>Chargement...</Text> : null}
        {practitioners.data && filtered.length === 0 ? (
          <Text style={{ color: colors.muted, fontFamily: font.regular }}>Aucun praticien ne correspond.</Text>
        ) : null}

        {filtered.map((p) => {
          const active = p.id === practitionerId;
          return (
            <Pressable
              key={p.id}
              onPress={() => { setPractitionerId(p.id); setSlot(null); }}
              style={{
                borderWidth: 1, borderRadius: radius.md, padding: 14, gap: 2,
                borderColor: active ? colors.navy : colors.border,
                backgroundColor: active ? colors.accentSoft : "#fff",
              }}
            >
              <Text style={{ fontFamily: font.semibold, fontSize: 16, color: colors.text }}>{p.name}</Text>
              {p.specialty ? <Text style={{ fontFamily: font.regular, color: colors.muted }}>{p.specialty}</Text> : null}
              {p.clinic ? <Text style={{ fontFamily: font.regular, color: colors.muted, fontSize: 12 }}>{p.clinic}</Text> : null}
            </Pressable>
          );
        })}
      </Card>

      {selected ? (
        <Card style={{ gap: 12 }}>
          <Text style={{ fontFamily: font.bold, fontSize: 17 }}>2. Choisir un créneau</Text>
          <Text style={{ fontFamily: font.regular, color: colors.muted }}>{selected.name}</Text>

          <ChipRow>
            {days.map((d) => (
              <Chip key={d.toISOString()} label={dayLabel(d)} selected={day.getTime() === d.getTime()}
                onPress={() => { setDay(d); setSlot(null); }} />
            ))}
          </ChipRow>

          <ErrorText error={slots.error} />
          {slots.isLoading ? <Text style={{ color: colors.muted, fontFamily: font.regular }}>Chargement des créneaux...</Text> : null}
          {slots.data && slots.data.length === 0 ? (
            <Text style={{ color: colors.muted, fontFamily: font.regular }}>Aucun créneau disponible ce jour-là.</Text>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(slots.data ?? []).map((s) => (
              <Chip key={s.id} label={timeLabel(s.startsAt)} selected={slot?.id === s.id} onPress={() => setSlot(s)} />
            ))}
          </View>
        </Card>
      ) : null}

      {selected && slot ? (
        <Card style={{ gap: 12 }}>
          <Text style={{ fontFamily: font.bold, fontSize: 17 }}>3. Confirmer</Text>
          <Text style={{ fontFamily: font.regular, color: colors.text }}>
            {selected.name}{selected.specialty ? `, ${selected.specialty}` : ""}
          </Text>
          <Text style={{ fontFamily: font.semibold, color: colors.text }}>
            {dayLabel(day)} à {timeLabel(slot.startsAt)}
          </Text>
          <Field label="Motif (optionnel)" value={reason} onChangeText={setReason} multiline />
          <ErrorText error={book.error} />
          <Button title="Confirmer le rendez-vous" onPress={() => book.mutate()} loading={book.isPending} />
        </Card>
      ) : null}
    </Screen>
  );
}
