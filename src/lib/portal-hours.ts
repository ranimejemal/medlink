// US-49: the portal books appointments from 6:00 to 22:00, Tunis time (UTC+1 all year).
// The database enforces it (trigger appointments_portal_hours); this helper only drives the UI.

export type PortalHours = { open_hour: number; close_hour: number; enabled: boolean };

export const DEFAULT_HOURS: PortalHours = { open_hour: 6, close_hour: 22, enabled: true };

export function tunisHour(at: Date): number {
  const h = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: "Africa/Tunis",
  }).format(at);
  return Number(h);
}

export function isPortalOpen(at: Date, hours: PortalHours = DEFAULT_HOURS): boolean {
  if (!hours.enabled) return true;
  const h = tunisHour(at);
  return h >= hours.open_hour && h < hours.close_hour;
}

export function closedMessage(hours: PortalHours = DEFAULT_HOURS): string {
  return `La prise de rendez-vous en ligne est ouverte de ${hours.open_hour} h à ${hours.close_hour} h (heure de Tunis). Vous pouvez consulter vos informations ; pour une urgence, appelez la clinique ou le 190.`;
}
