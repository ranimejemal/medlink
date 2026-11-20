import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Chip, EmptyState, ErrorText, Screen } from "@/components/ui";
import {
  Practitioner,
  Slot,
  bookAppointment,
  fetchFilters,
  fetchPractitionerIdsAvailableOn,
  fetchPractitioners,
  fetchSlots,
} from "@/lib/practitioners";
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
const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const label = { fontFamily: font.semibold, fontSize: 13, color: colors.muted } as const;

export default function Book() {
  const router = useRouter();
  const qc = useQueryClient();

  // filtres
  const [search, setSearch] = useState("");
  const [specialtyId, setSpecialtyId] = useState<string | null>(null);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [filterDay, setFilterDay] = useState<Date | null>(null);

  // sélection
  const [practitioner, setPractitioner] = useState<Practitioner | null>(null);
  const [day, setDay] = useState<Date>(days[0]);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [reason, setReason] = useState("");

  const filters = useQuery({ queryKey: ["filters"], queryFn: fetchFilters });
  const practitioners = useQuery({ queryKey: ["practitioners"], queryFn: fetchPractitioners });
  const availableIds = useQuery({
    queryKey: ["available-ids", filterDay?.toDateString()],
    queryFn: () => fetchPractitionerIdsAvailableOn(filterDay!),
    enabled: !!filterDay,
  });

  const filtered = useMemo(() => {
    const q = norm(search.trim());
    return (practitioners.data ?? []).filter((p) => {
      if (q && !norm(p.name).includes(q)) return false;
      if (specialtyId && p.specialtyId !== specialtyId) return false;
      if (clinicId && p.clinicId !== clinicId) return false;
      if (filterDay && availableIds.data && !availableIds.data.has(p.id)) return false;
      return true;
    });
  }, [practitioners.data, search, specialtyId, clinicId, filterDay, availableIds.data]);

  const slots = useQuery({
    queryKey: ["slots", practitioner?.id, day.toDateString()],
    queryFn: () => fetchSlots(practitioner!.id, day),
    enabled: !!practitioner,
  });

  const book = useMutation({
    mutationFn: () => bookAppointment({ practitionerId: practitioner!.id, slot: slot!, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["slots"] });
      syncReminders();
      // Adaptez les params si booking-confirmed.tsx en attend d'autres
      router.replace({
        pathname: "/booking-confirmed",
        params: { practitioner: practitioner!.name, startsAt: slot!.startsAt.toISOString() },
      });
    },
    onError: () => {
      // créneau pris entre-temps : on recharge et on désélectionne
      setSlot(null);
      qc.invalidateQueries({ queryKey: ["slots"] });
    },
  });

  function choose(p: Practitioner) {
    setPractitioner(p);
    setDay(filterDay ?? days[0]);
    setSlot(null);
    setReason("");
  }

  // ---------- Étape 2 et 3 : créneau + motif ----------
  if (practitioner) {
    return (
      <Screen>
        <Card style={{ gap: 4 }}>
          <Text style={{ fontFamily: font.bold, fontSize: 18 }}>{practitioner.name}</Text>
          <Text style={{ fontFamily: font.regular, color: colors.muted }}>
            {[practitioner.specialty, practitioner.clinic].filter(Boolean).join(" · ")}
          </Text>
          <Text
            onPress={() => setPractitioner(null)}
            style={{ color: colors.navy, fontFamily: font.semibold, marginTop: 6 }}
          >
            Changer de praticien
          </Text>
        </Card>

        <Card style={{ gap: 12 }}>
          <Text style={{ fontFamily: font.bold, fontSize: 17 }}>2. Choisir un créneau</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
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
          {slots.isLoading ? <ActivityIndicator color={colors.navy} /> : null}
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

        <Card style={{ gap: 12 }}>
          <Text style={{ fontFamily: font.bold, fontSize: 17 }}>3. Motif (facultatif)</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Ex. douleur thoracique, contrôle annuel…"
            placeholderTextColor={colors.muted}
            multiline
            maxLength={500}
            style={{
              minHeight: 80,
              borderWidth: 1,
              borderColor: "#E2E8F0",
              borderRadius: 12,
              padding: 12,
              fontFamily: font.regular,
              textAlignVertical: "top",
            }}
          />
        </Card>

        <ErrorText error={book.error} />
        <Button
          title="Confirmer le rendez-vous"
          onPress={() => book.mutate()}
          loading={book.isPending}
          disabled={!slot}
        />
      </Screen>
    );
  }

  // ---------- Étape 1 : trouver un praticien ----------
  return (
    <Screen onRefresh={() => practitioners.refetch()} refreshing={practitioners.isRefetching}>
      <Card style={{ gap: 12 }}>
        <Text style={{ fontFamily: font.bold, fontSize: 17 }}>1. Trouver un praticien</Text>

        <Text style={label}>Nom</Text>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher…"
          placeholderTextColor={colors.muted}
          autoCorrect={false}
          style={{
            borderWidth: 1,
            borderColor: "#E2E8F0",
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontFamily: font.regular,
          }}
        />

        <Text style={label}>Spécialité</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label="Toutes" selected={!specialtyId} onPress={() => setSpecialtyId(null)} />
          {(filters.data?.specialties ?? []).map((s) => (
            <Chip
              key={s.id}
              label={s.name}
              selected={specialtyId === s.id}
              onPress={() => setSpecialtyId(s.id)}
            />
          ))}
        </ScrollView>

        <Text style={label}>Clinique</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label="Toutes" selected={!clinicId} onPress={() => setClinicId(null)} />
          {(filters.data?.clinics ?? []).map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              selected={clinicId === c.id}
              onPress={() => setClinicId(c.id)}
            />
          ))}
        </ScrollView>

        <Text style={label}>Date</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label="Toutes" selected={!filterDay} onPress={() => setFilterDay(null)} />
          {days.map((d) => (
            <Chip
              key={d.toISOString()}
              label={dayLabel(d)}
              selected={filterDay?.getTime() === d.getTime()}
              onPress={() => setFilterDay(d)}
            />
          ))}
        </ScrollView>
      </Card>

      <ErrorText error={practitioners.error} />
      <ErrorText error={filters.error} />
      {practitioners.isLoading || (filterDay && availableIds.isLoading) ? (
        <ActivityIndicator color={colors.navy} />
      ) : null}
      {!practitioners.isLoading && filtered.length === 0 ? (
        <EmptyState title="Aucun praticien trouvé" />
      ) : null}

    
       {filtered.map((p) => (
  <Pressable
    key={p.id}
    onPress={() => choose(p)}
    accessibilityRole="button"
    accessibilityLabel={`Choisir ${p.name}`}
    style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
  >
    <Card>
      <Text style={{ fontFamily: font.semibold, fontSize: 16 }}>{p.name}</Text>
      <Text style={{ fontFamily: font.regular, color: colors.muted }}>
        {p.specialty ?? "Spécialité non renseignée"}
      </Text>
      {p.clinic ? (
        <Text style={{ fontFamily: font.regular, color: colors.muted, fontSize: 12 }}>
          {p.clinic}
        </Text>
      ) : null}
    </Card>
  </Pressable>
))}
    
    </Screen>
  );
}