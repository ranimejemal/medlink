// Maps backend error codes to safe French user-facing messages. Never show raw errors.
const MESSAGES: Record<string, string> = {
  SLOT_TAKEN: "Ce créneau vient d'être réservé par un autre utilisateur. Veuillez sélectionner un autre créneau.",
  SLOT_NOT_FOUND: "Ce créneau n'est plus disponible.",
  SLOT_TOO_SOON: "Ce créneau est trop proche. Choisissez un créneau au moins une heure à l'avance.",
  TOO_MANY_APPOINTMENTS: "Vous avez atteint le nombre maximum de rendez-vous à venir (5).",
  TOO_LATE: "L'annulation n'est plus possible moins de 24 heures avant le rendez-vous. Veuillez contacter la clinique.",
  NOT_CANCELLABLE: "Ce rendez-vous ne peut plus être modifié.",
  FORBIDDEN: "Vous n'êtes pas autorisé à effectuer cette action.",
  NOT_FOUND: "Élément introuvable.",
  DIAGNOSIS_REQUIRED: "Le diagnostic est obligatoire avant validation.",
  ALREADY_VALIDATED: "Ce document est déjà validé.",
  SELF_DEMOTION: "Vous ne pouvez pas retirer votre propre rôle administrateur.",
  SELF_DEACTIVATION: "Vous ne pouvez pas désactiver votre propre compte.",
  INVALID_REASON: "Le motif est trop long (500 caractères maximum).",
  duplicate: "Cet élément existe déjà.",
};

export function friendlyError(err: unknown, fallback = "Une erreur est survenue. Veuillez réessayer."): string {
  const raw = err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : "";
  for (const key of Object.keys(MESSAGES)) if (raw.includes(key)) return MESSAGES[key] ?? fallback;
  if (raw.includes("duplicate key")) return MESSAGES["duplicate"] ?? fallback;
  if (raw.includes("row-level security") || raw.includes("permission denied")) return MESSAGES["FORBIDDEN"] ?? fallback;
  if (raw.toLowerCase().includes("pwned") || raw.toLowerCase().includes("weak")) return "Ce mot de passe est trop faible ou apparaît dans une fuite de données connue.";
  if (raw.includes("already registered")) return "Un compte existe déjà avec cette adresse e-mail.";
  if (raw.toLowerCase().includes("invalid totp") || raw.toLowerCase().includes("invalid code")) return "Code de vérification invalide.";
  console.error(err);
  return fallback;
}
