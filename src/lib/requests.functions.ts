import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Turns a patient's free-text notes into a structured request and saves it for staff review. */
export const submitAppointmentRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ notes: z.string().trim().min(10).max(4000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isPatient } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "patient" });
    if (!isPatient) return { ok: false as const, error: "Seuls les patients peuvent envoyer une demande." };
    const { structureNotes } = await import("./ai.server");
    const res = await structureNotes(data.notes);
    if (!res.ok) return { ok: false as const, error: res.error };
    const s = res.data;
    const { data: row, error } = await context.supabase
      .from("appointment_requests")
      .insert({
        patient_id: context.userId,
        raw_notes: data.notes,
        summary: s.summary,
        urgency: s.urgency,
        suggested_specialty: s.suggested_specialty,
        symptoms: s.symptoms,
        duration: s.duration,
        preferred_timing: s.preferred_timing,
      })
      .select("id")
      .single();
    if (error) {
      console.error(error);
      return { ok: false as const, error: "Impossible d'enregistrer la demande." };
    }
    return { ok: true as const, id: row.id, structured: s };
  });
