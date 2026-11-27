// US-35: helpers for the audit log page (labels, filters, CSV export).

export type AuditRow = {
  id: string;
  created_at: string;
  user_email: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  severity: string;
  ip_address: string | null;
  details: unknown;
};

// Families of actions, used by the "Type" filter. The value is the prefix matched in SQL.
export const AUDIT_CATEGORIES = [
  { value: "all", label: "Tous les types" },
  { value: "auth.", label: "Connexions" },
  { value: "mfa.", label: "Double authentification" },
  { value: "record.", label: "Accès aux dossiers" },
  { value: "appointment.", label: "Rendez-vous" },
  { value: "document.", label: "Documents" },
  { value: "email.", label: "E-mails" },
  { value: "security.", label: "Alertes sécurité" },
  { value: "user.", label: "Comptes utilisateurs" },
  { value: "account.", label: "Créations de compte" },
] as const;

export const AUDIT_SEVERITIES = [
  { value: "all", label: "Toutes" },
  { value: "info", label: "Info" },
  { value: "warning", label: "Avertissement" },
  { value: "critical", label: "Critique" },
] as const;

const ACTION_LABELS: Record<string, string> = {
  "auth.login_success": "Connexion réussie",
  "auth.login_failed": "Échec de connexion",
  "auth.logout": "Déconnexion",
  "auth.session_expired": "Session expirée",
  "auth.account_locked": "Compte verrouillé",
  "mfa.enrolled": "Double authentification activée",
  "mfa.verified": "Double authentification vérifiée",
  "account.created": "Compte créé",
  "account.deletion_requested": "Suppression de compte demandée",
  "data.exported": "Export des données personnelles",
  "appointment.booked": "Rendez-vous pris",
  "appointment.booked_by_staff": "Rendez-vous pris par l'accueil",
  "appointment.cancelled": "Rendez-vous annulé",
  "appointment.rescheduled": "Rendez-vous déplacé",
  "record.viewed": "Dossier consulté",
  "record.denied": "Accès au dossier refusé",
  "access.denied": "Accès refusé",
  "document.downloaded": "Document téléchargé",
  "report.validated": "Compte rendu validé",
  "result.validated": "Résultat validé",
  "email.sent": "E-mail envoyé",
  "email.skipped": "E-mail non envoyé (désactivé)",
  "email.failed": "Échec d'envoi d'e-mail",
  "user.deleted": "Utilisateur supprimé",
  "invitation.created": "Invitation créée",
  "practitioner.clinic_assigned": "Clinique affectée",
  "practitioner.clinic_removed": "Clinique retirée",
  "absence.created": "Période bloquée",
  "absence.deleted": "Période débloquée",
  "stats.exported": "Statistiques exportées",
  "audit.exported": "Journal d'audit exporté",
  "security.bruteforce": "Alerte : échecs de connexion répétés",
  "security.suspicious_access": "Alerte : accès refusés répétés",
  "security.mass_access": "Alerte : consultation massive",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export const PAGE_SIZE = 50;
export const EXPORT_LIMIT = 5000;

// Converts the "from" / "to" date inputs (YYYY-MM-DD, Tunis local day) to an inclusive range.
export function dayRange(from: string, to: string): { gte?: string; lt?: string } {
  const range: { gte?: string; lt?: string } = {};
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) range.gte = `${from}T00:00:00+01:00`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    const end = new Date(`${to}T00:00:00+01:00`);
    end.setUTCDate(end.getUTCDate() + 1);
    range.lt = end.toISOString();
  }
  return range;
}

// Keeps only characters that are safe in a PostgREST "ilike" filter.
export function sanitizeSearch(q: string): string {
  return q
    .replace(/[^\p{L}\p{N}@._\- ]/gu, "")
    .trim()
    .slice(0, 100);
}

// One CSV cell: quoted, and protected against formula injection when opened in Excel (OWASP).
export function csvCell(value: unknown): string {
  let s = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(rows: AuditRow[]): string {
  const header = ["Date", "Utilisateur", "Action", "Libellé", "Objet", "Id objet", "Gravité", "IP"];
  const lines = rows.map((r) =>
    [
      r.created_at,
      r.user_email,
      r.action,
      actionLabel(r.action),
      r.entity,
      r.entity_id,
      r.severity,
      r.ip_address,
    ]
      .map(csvCell)
      .join(";"),
  );
  // BOM so that Excel opens the accents correctly.
  return String.fromCharCode(0xfeff) + [header.map(csvCell).join(";"), ...lines].join("\r\n");
}
