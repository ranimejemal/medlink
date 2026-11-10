export function isValidMaintenancePeriod(startsAt: string, endsAt: string): boolean {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();

  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}
