// US-21: the practitioner types a period in Tunis local time (UTC+1, no daylight saving).

/** "2026-12-24T08:00" (an <input type="datetime-local"> value) -> ISO string in UTC. */
export function tunisLocalToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const d = new Date(`${local}:00+01:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Same checks as block_period() in the database, to show the error before sending. */
export function periodError(startIso: string | null, endIso: string | null, now = Date.now()) {
  if (!startIso || !endIso) return "Indiquez le début et la fin de l'absence.";
  const s = new Date(startIso).getTime();
  const e = new Date(endIso).getTime();
  if (e <= s) return "La fin doit être après le début.";
  if (e < now) return "Cette période est déjà passée.";
  if (e - s > 120 * 24 * 3600 * 1000) return "Une absence dure au plus 120 jours.";
  return null;
}
