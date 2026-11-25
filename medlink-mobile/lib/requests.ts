import { supabase } from "./supabase";
import { getUserId } from "./auth";

// Schéma réel de appointment_requests : raw_notes, summary et urgency sont obligatoires.
// ⚠️ À adapter avec une valeur d'urgence acceptée par ta base (voir la requête SQL de contraintes)
const DEFAULT_URGENCY = "medium";

export const requestText = (r: any): string => r?.summary || r?.raw_notes || "";
export const isOpenRequest = (r: any) => String(r?.status ?? "") === "pending";

function explain(error: any): Error {
  const msg: string = error?.message ?? "Erreur inconnue";
  if (error?.code === "42501" || /row-level security/i.test(msg)) {
    return new Error("La base refuse l'enregistrement de la demande (politique RLS).");
  }
  if (error?.code === "23514") {
    return new Error(
      `La valeur d'urgence "${DEFAULT_URGENCY}" n'est pas acceptée par la base. Change DEFAULT_URGENCY dans lib/requests.ts.`,
    );
  }
  const notNull = /null value in column "([^"]+)"/.exec(msg)?.[1];
  if (notNull)
    return new Error(`La colonne obligatoire "${notNull}" n'est pas renseignée par l'app.`);
  return new Error(msg);
}

export async function createRequest(notes: string) {
  const clean = notes.trim();
  if (clean.length < 10) throw new Error("Décrivez votre besoin en au moins 10 caractères.");
  if (clean.length > 4000) throw new Error("Texte trop long (4000 caractères maximum).");

  const uid = await getUserId();
  const row: Record<string, any> = {
    patient_id: uid,
    raw_notes: clean,
    summary: clean.length > 160 ? clean.slice(0, 157) + "..." : clean,
    urgency: DEFAULT_URGENCY,
    // symptoms (défaut '{}') et status (défaut 'pending') sont remplis par la base
  };
  const { error } = await supabase.from("appointment_requests").insert(row as any);
  if (error) throw explain(error);
}
