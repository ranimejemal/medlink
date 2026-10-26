// Maps backend error codes to safe French user-facing messages. Never show raw errors.
const MESSAGES: Record<string, string> = {
  SLOT_TAKEN:
    "Ce créneau vient d'être réservé par un autre utilisateur. Veuillez sélectionner un autre créneau.",
  SLOT_NOT_FOUND: "Ce créneau n'est plus disponible.",
  SLOT_TOO_SOON: "Ce créneau est trop proche. Choisissez un créneau au moins une heure à l'avance.",
  TOO_MANY_APPOINTMENTS: "Vous avez atteint le nombre maximum de rendez-vous à venir (5).",
  TOO_LATE:
    "L'annulation n'est plus possible moins de 24 heures avant le rendez-vous. Veuillez contacter la clinique.",
  NOT_CANCELLABLE: "Ce rendez-vous ne peut plus être modifié.",
  FORBIDDEN: "Vous n'êtes pas autorisé à effectuer cette action.",
  NOT_FOUND: "Élément introuvable.",
  DIAGNOSIS_REQUIRED: "Le diagnostic est obligatoire avant validation.",
  ALREADY_VALIDATED: "Ce document est déjà validé.",
  SELF_DEMOTION: "Vous ne pouvez pas retirer votre propre rôle administrateur.",
  SELF_DEACTIVATION: "Vous ne pouvez pas désactiver votre propre compte.",
  INVALID_REASON: "Le motif est trop long (500 caractères maximum).",
  PRACTITIONER_ALREADY_LINKED: "Ce praticien a déjà un compte ou une invitation en cours.",
  INVALID_SLOT: "Créneau invalide : il doit être dans le futur et durer au plus 4 heures.",
  SLOT_OVERLAP: "Ce créneau chevauche un créneau existant.",
  INVALID_EMAIL: "Adresse e-mail invalide.",
  SELF_DELETION: "Vous ne pouvez pas supprimer votre propre compte.",
  LAST_ADMIN: "Impossible de supprimer le dernier administrateur.",
  HAS_CLINICAL_DATA:
    "Ce compte a un historique médical (rendez-vous, résultats ou comptes rendus). Désactivez-le plutôt que de le supprimer.",
  duplicate: "Cet élément existe déjà.",
};

// Supabase Auth error codes (AuthError.code) -> safe French messages.
const AUTH_CODES: Record<string, string> = {
  user_already_exists: "Un compte existe déjà avec cette adresse e-mail.",
  email_exists: "Un compte existe déjà avec cette adresse e-mail.",
  weak_password: "Ce mot de passe est trop faible ou apparaît dans une fuite de données connue.",
  email_address_invalid: "Cette adresse e-mail n'est pas acceptée.",
  signup_disabled: "Les inscriptions sont désactivées pour le moment.",
  over_email_send_rate_limit: "Trop d'e-mails envoyés. Réessayez dans une heure.",
  over_request_rate_limit: "Trop de tentatives. Patientez quelques minutes puis réessayez.",
  email_provider_disabled: "L'inscription par e-mail est désactivée.",
  validation_failed: "Certaines informations sont invalides. Vérifiez le formulaire.",
  unexpected_failure:
    "Le service d'inscription est momentanément indisponible. Réessayez plus tard.",
};

export function friendlyError(
  err: unknown,
  fallback = "Une erreur est survenue. Veuillez réessayer.",
): string {
  const code =
    typeof err === "object" && err && "code" in err ? String((err as { code: unknown }).code) : "";
  if (code && AUTH_CODES[code]) return AUTH_CODES[code]!;
  const rawMsg =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err && "message" in err
        ? String((err as { message: unknown }).message)
        : "";
  if (/failed to fetch|networkerror|load failed/i.test(rawMsg))
    return "Connexion au serveur impossible. Vérifiez votre connexion Internet.";
  if (/error sending (confirmation|recovery)|sending .* email/i.test(rawMsg))
    return "Impossible d'envoyer l'e-mail de confirmation. Réessayez dans quelques minutes.";
  if (/rate limit/i.test(rawMsg)) return AUTH_CODES["over_email_send_rate_limit"]!;
  if (/database error saving new user/i.test(rawMsg)) return AUTH_CODES["unexpected_failure"]!;
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err && "message" in err
        ? String((err as { message: unknown }).message)
        : "";
  for (const key of Object.keys(MESSAGES)) if (raw.includes(key)) return MESSAGES[key] ?? fallback;
  if (raw.includes("duplicate key")) return MESSAGES["duplicate"] ?? fallback;
  if (raw.includes("row-level security") || raw.includes("permission denied"))
    return MESSAGES["FORBIDDEN"] ?? fallback;
  if (raw.toLowerCase().includes("pwned") || raw.toLowerCase().includes("weak"))
    return "Ce mot de passe est trop faible ou apparaît dans une fuite de données connue.";
  if (raw.includes("already registered")) return "Un compte existe déjà avec cette adresse e-mail.";
  if (raw.toLowerCase().includes("invalid totp") || raw.toLowerCase().includes("invalid code"))
    return "Code de vérification invalide.";
  console.error(err);
  return fallback;
}
