export const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
export const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("fr-FR", { dateStyle: "medium" });
export const STATUS: Record<string, { label: string; color: string }> = {
  scheduled: { label: "Planifié", color: "#B45309" },
  confirmed: { label: "Confirmé", color: "#16A34A" },
  cancelled: { label: "Annulé", color: "#DC2626" },
  completed: { label: "Terminé", color: "#6B7280" },
  no_show: { label: "Absent", color: "#6B7280" },
};
