import { supabase } from "@/integrations/supabase/client";

// Les nouvelles fonctions SQL ne sont pas encore dans les types générés : appel non typé
const rpc = (name: string, args?: Record<string, unknown>) => (supabase as any).rpc(name, args);

const MESSAGES: Record<string, string> = {
  FORBIDDEN: "Accès réservé : votre rôle ne permet pas de consulter ces données.",
  INVALID_PERIOD: "Période invalide.",
};

function fail(error: { message?: string }): never {
  const msg = error?.message ?? "";
  const key = Object.keys(MESSAGES).find((k) => msg.includes(k));
  throw new Error(key ? MESSAGES[key] : msg || "Erreur inconnue");
}

export type ClinicStat = {
  clinic_id: string; name: string; city: string; practitioners: number;
  total: number; completed: number; cancelled: number; no_show: number;
  upcoming: number; slots_14d: number; booked_14d: number;
};
export type PeriodStats = {
  booked: number; online: number; by_staff: number; cancelled: number; no_show: number; completed: number;
};
export type DirectionSummary = {
  period_days: number; current: PeriodStats; previous: PeriodStats;
  new_patients: { current: number; previous: number };
  weekly: { week: string; online: number; by_staff: number }[];
};
export type StatRow = {
  month: string; city: string; specialty: string;
  appointments: number; completed: number; cancelled: number; no_show: number;
};
export type AnonymizedStats = { k: number; rows: StatRow[] };

export async function fetchClinicSupervision(days: number): Promise<ClinicStat[]> {
  const { data, error } = await rpc("clinic_supervision", { _days: days });
  if (error) fail(error);
  return (data ?? []) as ClinicStat[];
}

export async function fetchDirectionSummary(days: number): Promise<DirectionSummary> {
  const { data, error } = await rpc("direction_summary", { _days: days });
  if (error) fail(error);
  return data as DirectionSummary;
}

export async function fetchAnonymizedStats(from: string, to: string): Promise<AnonymizedStats> {
  const { data, error } = await rpc("anonymized_stats", { _from: from, _to: to });
  if (error) fail(error);
  return data as AnonymizedStats;
}

// CSV avec point-virgule (Excel en français) et protection contre l'injection de formules
export function toCsv(rows: StatRow[]): string {
  const head = ["Mois", "Ville", "Spécialité", "Rendez-vous", "Terminés", "Annulés", "Absents"];
  const esc = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) =>
    [r.month, r.city, r.specialty, r.appointments, r.completed, r.cancelled, r.no_show].map(esc).join(";"),
  );
  return [head.join(";"), ...lines].join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}