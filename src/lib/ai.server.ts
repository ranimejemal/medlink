import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, Output, streamText } from "ai";
import { z } from "zod/v4";

// Any OpenAI-compatible endpoint works (OpenAI, Azure OpenAI, a self-hosted vLLM/Ollama, ...).
const BASE_URL = process.env["AI_BASE_URL"] ?? "https://api.openai.com/v1";
const MODEL = process.env["AI_MODEL"] ?? "gpt-4o-mini";

export const structuredRequestSchema = z.object({
  summary: z
    .string()
    .describe("Résumé clinique neutre en 1 à 3 phrases, en français, pour le personnel."),
  urgency: z.enum(["low", "medium", "high", "urgent"]),
  suggested_specialty: z
    .string()
    .nullable()
    .describe("Spécialité médicale la plus adaptée, ou null."),
  symptoms: z.array(z.string()).describe("Symptômes ou motifs mentionnés, formulations courtes."),
  duration: z.string().nullable().describe("Depuis quand, si mentionné."),
  preferred_timing: z
    .string()
    .nullable()
    .describe("Disponibilités ou préférences du patient, si mentionnées."),
});
export type StructuredRequest = z.infer<typeof structuredRequestSchema>;

const INSTRUCTIONS = `Tu es un assistant administratif d'un réseau de cliniques. Tu transformes les notes libres d'un patient en une demande de rendez-vous structurée destinée au personnel d'accueil, qui la validera.
- Ne pose aucun diagnostic et ne donne aucun conseil médical.
- N'invente rien : si une information manque, utilise null ou une liste vide.
- Urgence : "urgent" seulement pour des signes d'alerte (douleur thoracique, difficulté respiratoire, saignement important, perte de connaissance…), "high" si aggravation rapide, "medium" pour un problème gênant, "low" pour un suivi ou contrôle.
- Rédige en français.`;

export type StructureResult = { ok: true; data: StructuredRequest } | { ok: false; error: string };

export async function structureNotes(notes: string): Promise<StructureResult> {
  const apiKey = process.env["AI_API_KEY"];
  if (!apiKey) return { ok: false, error: "Le service d'assistance n'est pas configuré." };
  const provider = createOpenAI({ baseURL: BASE_URL, apiKey });
  try {
    const result = streamText({
      model: provider.chat(MODEL),
      instructions: INSTRUCTIONS,
      messages: [{ role: "user", content: `Notes du patient :\n"""${notes}"""` }],
      output: Output.object({ schema: structuredRequestSchema }),
      maxRetries: 0,
    });
    const data = await result.output;
    return { ok: true, data };
  } catch (e) {
    console.error("structureNotes failed", e);
    const status = APICallError.isInstance(e) ? e.statusCode : undefined;
    if (status === 429)
      return {
        ok: false,
        error: "Trop de demandes en ce moment. Réessayez dans quelques instants.",
      };
    if (status === 402)
      return {
        ok: false,
        error: "Le service d'assistance est temporairement indisponible (crédits épuisés).",
      };
    if (status === 403)
      return { ok: false, error: "L'assistance n'a pas pu traiter cette demande." };
    return { ok: false, error: "L'assistance est momentanément indisponible. Veuillez réessayer." };
  }
}
