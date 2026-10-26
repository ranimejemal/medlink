import { format } from "date-fns";
import { fr } from "date-fns/locale";

export const fmtDate = (d: string | Date) =>
  format(new Date(d), "EEEE d MMMM yyyy", { locale: fr });
export const fmtShort = (d: string | Date) => format(new Date(d), "dd/MM/yyyy", { locale: fr });
export const fmtTime = (d: string | Date) => format(new Date(d), "HH:mm", { locale: fr });
export const fmtDateTime = (d: string | Date) =>
  format(new Date(d), "dd/MM/yyyy HH:mm", { locale: fr });
export const drName = (
  p?: { title?: string | null; first_name: string; last_name: string } | null,
) => (p ? `${p.title ?? "Dr"} ${p.first_name} ${p.last_name}` : "—");
export const fullName = (p?: { first_name: string; last_name: string } | null) =>
  p ? `${p.first_name} ${p.last_name}`.trim() || "—" : "—";
