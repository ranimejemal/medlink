// US-08 / US-12: content of the confirmation and reminder e-mails (pure functions, unit-tested).

export type AppointmentEmailRow = {
  kind: "confirmation" | "reminder";
  first_name: string;
  starts_at: string;
  ends_at: string;
  practitioner: string;
  clinic_name: string;
  clinic_address: string;
  clinic_city: string;
  clinic_phone: string;
};

const TZ = "Africa/Tunis";

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

export function formatAppointmentDate(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TZ,
  });
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  return { date, time };
}

export function buildAppointmentEmail(row: AppointmentEmailRow, siteUrl = "") {
  const { date, time } = formatAppointmentDate(row.starts_at);
  const end = formatAppointmentDate(row.ends_at).time;
  const hello = row.first_name ? `Bonjour ${row.first_name},` : "Bonjour,";
  const isReminder = row.kind === "reminder";
  const subject = isReminder
    ? `Rappel : votre rendez-vous du ${date} à ${time}`
    : `Confirmation de votre rendez-vous du ${date} à ${time}`;
  const intro = isReminder
    ? "Nous vous rappelons votre rendez-vous prévu dans moins de 24 h :"
    : "Votre rendez-vous est bien enregistré :";
  const details: [string, string][] = [
    ["Praticien", row.practitioner],
    ["Date", date],
    ["Heure", `${time} – ${end}`],
    ["Clinique", row.clinic_name],
    ["Adresse", `${row.clinic_address}, ${row.clinic_city}`],
    ["Téléphone", row.clinic_phone],
  ];
  const manage =
    "Pour annuler ou reporter (au plus tard 24 h avant), connectez-vous à votre espace MedLink" +
    (siteUrl ? ` : ${siteUrl}/patient/appointments` : ".");

  const text = [
    hello,
    "",
    intro,
    ...details.map(([k, v]) => `- ${k} : ${v}`),
    "",
    manage,
    "",
    "MedLink — Portail médical sécurisé",
    "Cet e-mail est envoyé automatiquement, merci de ne pas y répondre.",
  ].join("\n");

  const rows = details
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#64748b">${escapeHtml(k)}</td>` +
        `<td style="padding:4px 0;font-weight:600">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  const link = siteUrl
    ? `<p><a href="${escapeHtml(siteUrl)}/patient/appointments" style="color:#0e7490">Gérer mes rendez-vous</a></p>`
    : "";
  const html =
    `<div style="font-family:Arial,sans-serif;font-size:15px;color:#0f172a;max-width:560px">` +
    `<h2 style="color:#0b1f3a;margin:0 0 16px">MedLink</h2>` +
    `<p>${escapeHtml(hello)}</p><p>${escapeHtml(intro)}</p>` +
    `<table style="border-collapse:collapse;margin:12px 0">${rows}</table>` +
    `<p style="color:#475569">Pour annuler ou reporter (au plus tard 24 h avant), connectez-vous à votre espace MedLink.</p>` +
    link +
    `<p style="color:#94a3b8;font-size:12px;margin-top:24px">MedLink — Portail médical sécurisé. ` +
    `Cet e-mail est envoyé automatiquement, merci de ne pas y répondre.</p></div>`;

  return { subject, text, html };
}
