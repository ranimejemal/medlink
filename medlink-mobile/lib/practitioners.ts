import { supabase } from "./supabase";
import { getUserId } from "./auth";

const pick = (o: any, keys: string[]) => {
  for (const k of keys) if (o?.[k] != null && o[k] !== "") return o[k];
  return null;
};

export type Option = { id: string; name: string };
export type Practitioner = {
  id: string;
  name: string;
  specialtyId: string | null;
  specialty: string | null;
  clinicId: string | null;
  clinic: string | null;
};
export type Slot = { id: string; startsAt: Date; endsAt: Date | null };

// Mêmes tables et filtres que le web (patient/appointments/new.tsx)
export async function fetchFilters(): Promise<{ specialties: Option[]; clinics: Option[] }> {
  const [sp, cl] = await Promise.all([
    supabase.from("specialties").select("id,name").order("name"),
    supabase.from("clinics").select("id,name,city").eq("is_active", true).order("city"),
  ]);
  if (sp.error) throw sp.error;
  if (cl.error) throw cl.error;
  return {
    specialties: (sp.data ?? []).map((s: any) => ({ id: String(s.id), name: s.name })),
    clinics: (cl.data ?? []).map((c: any) => ({
      id: String(c.id),
      name: c.city ? `${c.name} (${c.city})` : c.name,
    })),
  };
}

export async function fetchPractitioners(): Promise<Practitioner[]> {
  const [pr, pc, f] = await Promise.all([
    supabase.from("practitioners").select("*"),
    supabase.from("practitioner_clinics").select("*"),
    fetchFilters(),
  ]);
  if (pr.error) throw pr.error;

  const rows = (pr.data ?? []).filter((p: any) => p.is_active !== false);

  // practitioner_id -> premier clinic_id trouvé
  const clinicByPractitioner: Record<string, string> = {};
  for (const row of (pc.data ?? []) as any[]) {
    const pid = String(row.practitioner_id);
    if (!clinicByPractitioner[pid] && row.clinic_id != null) {
      clinicByPractitioner[pid] = String(row.clinic_id);
    }
  }

  // Si le nom n'est pas dans practitioners, on le cherche dans profiles
  let profiles: Record<string, any> = {};
  const needNames = rows.filter((p: any) => !pick(p, ["full_name", "display_name", "name"]));
  if (needNames.length > 0) {
    const ids = needNames.map((p: any) => p.user_id ?? p.profile_id ?? p.id).filter(Boolean);
    const res = await supabase.from("profiles").select("*").in("id", ids);
    if (!res.error) profiles = Object.fromEntries((res.data ?? []).map((x: any) => [x.id, x]));
  }

  const spName = Object.fromEntries(f.specialties.map((s) => [s.id, s.name]));
  const clName = Object.fromEntries(f.clinics.map((c) => [c.id, c.name]));

  return rows
    .map((p: any) => {
      const prof = profiles[p.user_id ?? p.profile_id ?? p.id];
      const direct = pick(p, ["full_name", "display_name", "name"]);
      const fromProfile =
        pick(prof, ["full_name", "display_name", "name"]) ??
        [prof?.first_name, prof?.last_name].filter(Boolean).join(" ");
      const name = String(direct ?? (fromProfile || "Praticien"));
      const spId = p.specialty_id != null ? String(p.specialty_id) : null;
      const clId = clinicByPractitioner[String(p.id)] ?? null; // ✅ via practitioner_clinics
      return {
        id: String(p.id),
        name: /^dr\.?\s/i.test(name) ? name : `Dr ${name}`,
        specialtyId: spId,
        specialty: (spId && spName[spId]) || pick(p, ["specialty", "specialty_name"]),
        clinicId: clId,
        clinic: clId ? (clName[clId] ?? null) : null,
      };
    })
    .sort((a: Practitioner, b: Practitioner) => a.name.localeCompare(b.name, "fr"));
}

// Vraies disponibilités (table availability_slots), comme le web
export async function fetchSlots(practitionerId: string, day: Date): Promise<Slot[]> {
  const { data, error } = await supabase
    .from("availability_slots")
    .select("*")
    .eq("practitioner_id", practitionerId)
    .limit(1000);
  if (error) throw error;

  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(day);
  dayEnd.setHours(23, 59, 59, 999);

  return (data ?? [])
    .map((s: any) => {
      const start = pick(s, ["starts_at", "start_time", "start_at", "slot_start", "start"]);
      const end = pick(s, ["ends_at", "end_time", "end_at", "slot_end", "end"]);
      const taken =
        s.is_booked === true ||
        s.is_available === false ||
        ["booked", "taken", "reserved"].includes(String(s.status ?? "").toLowerCase()) ||
        s.appointment_id != null;
      return start && !taken
        ? { id: String(s.id), startsAt: new Date(start), endsAt: end ? new Date(end) : null }
        : null;
    })
    .filter(
      (s: Slot | null): s is Slot =>
        !!s && s.startsAt >= dayStart && s.startsAt <= dayEnd && s.startsAt.getTime() > Date.now(),
    )
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export async function bookAppointment(input: {
  practitionerId: string;
  clinicId: string | null;
  slot: Slot;
  reason: string;
}) {
  const uid = await getUserId();
  let clinicId = input.clinicId;

  // 1. Chercher la clinique du praticien
  if (!clinicId) {
    const { data: pc } = await supabase
      .from("practitioner_clinics")
      .select("clinic_id")
      .eq("practitioner_id", input.practitionerId)
      .limit(1)
      .maybeSingle();
    clinicId = pc?.clinic_id ? String(pc.clinic_id) : null;
  }

  // 2. Sinon, chercher dans le créneau (ignoré si la colonne n'existe pas)
  if (!clinicId) {
    const { data: s } = await supabase
      .from("availability_slots")
      .select("clinic_id")
      .eq("id", input.slot.id)
      .maybeSingle();
    clinicId = (s as any)?.clinic_id ? String((s as any).clinic_id) : null;
  }

  if (!clinicId) throw new Error("Aucune clinique associée à ce praticien.");

  const { error } = await supabase.from("appointments").insert({
    patient_id: uid,
    practitioner_id: input.practitionerId,
    clinic_id: clinicId, // ✅
    slot_id: input.slot.id,
    starts_at: input.slot.startsAt.toISOString(),
    ends_at: input.slot.endsAt?.toISOString() ?? null,
    status: "scheduled",
    reason: input.reason.trim() || null,
  });
  if (error) throw error;
}

export async function rescheduleAppointment(appointmentId: string, slot: Slot) {
  const { error } = await supabase
    .from("appointments")
    .update({
      slot_id: slot.id,
      starts_at: slot.startsAt.toISOString(),
      ends_at: slot.endsAt?.toISOString() ?? null,
    })
    .eq("id", appointmentId);
  if (error) throw error;
}
