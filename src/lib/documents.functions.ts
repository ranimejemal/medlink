import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildDocumentPdf, type PdfDocumentInput } from "@/lib/document-pdf";

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "Africa/Tunis" });
const show = (v: unknown) => (typeof v === "object" && v !== null ? JSON.stringify(v) : String(v));

/**
 * US-14: download of a validated document (consultation report or exam result) as a PDF.
 * The query runs with the user's own token, so RLS decides access: a patient only gets his own
 * validated documents. Every attempt is written to the audit log with the client IP
 * (document.downloaded, or document.denied as a warning). The file travels over HTTPS (US-44).
 */
export const downloadDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ kind: z.enum(["report", "result"]), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const ip = getRequest()?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    const audit = (action: string, severity: "info" | "warning") =>
      sb.rpc("write_audit", {
        _action: action,
        _entity: data.kind === "report" ? "consultation_report" : "medical_result",
        _entity_id: data.id,
        _details: null as never,
        _severity: severity,
        _ip: ip,
      });

    let doc: Omit<PdfDocumentInput, "patient" | "generatedAt"> | null = null;
    let patientId = "";
    let practitionerId: string | null = null;
    let fileDate = "";

    if (data.kind === "report") {
      const { data: r } = await sb
        .from("consultation_reports_decrypted")
        .select("*")
        .eq("id", data.id)
        .eq("status", "validated")
        .maybeSingle();
      if (r?.patient_id) {
        patientId = r.patient_id;
        practitionerId = r.practitioner_id;
        fileDate = (r.validated_at ?? r.created_at ?? "").slice(0, 10);
        doc = {
          title: "Compte rendu de consultation",
          meta: [["Date", r.validated_at ? fmtDate(r.validated_at) : ""]],
          sections: [
            { heading: "Motif", body: r.reason ?? "" },
            { heading: "Observations", body: r.observations ?? "" },
            { heading: "Diagnostic", body: r.diagnosis ?? "" },
            { heading: "Prescription", body: r.prescription ?? "" },
            { heading: "Recommandations", body: r.recommendations ?? "" },
          ],
        };
      }
    } else {
      const { data: r } = await sb
        .from("medical_results_decrypted")
        .select("*")
        .eq("id", data.id)
        .eq("status", "validated")
        .maybeSingle();
      if (r?.patient_id) {
        patientId = r.patient_id;
        practitionerId = r.practitioner_id;
        fileDate = r.result_date ?? "";
        const values =
          r.values_json && typeof r.values_json === "object" && !Array.isArray(r.values_json)
            ? Object.entries(r.values_json).map(([k, v]) => [k, show(v)] as [string, string])
            : [];
        doc = {
          title: `Résultat d'examen : ${r.title ?? ""}`,
          meta: [
            ["Catégorie", r.category ?? ""],
            ["Date", r.result_date ? fmtDate(r.result_date) : ""],
          ],
          sections: [{ heading: "Résumé", body: r.summary ?? "" }],
          table: values,
        };
      }
    }

    if (!doc) {
      await audit("document.denied", "warning");
      throw new Error("NOT_FOUND");
    }

    const [{ data: p }, { data: pr }] = await Promise.all([
      sb.from("profiles").select("first_name,last_name").eq("id", patientId).maybeSingle(),
      practitionerId
        ? sb
            .from("practitioners")
            .select("title,first_name,last_name")
            .eq("id", practitionerId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (pr) doc.meta.unshift(["Praticien", `${pr.title} ${pr.first_name} ${pr.last_name}`]);

    const bytes = await buildDocumentPdf({
      ...doc,
      patient: p ? `${p.last_name.toUpperCase()} ${p.first_name}` : "",
      generatedAt: new Date(),
    });
    await audit("document.downloaded", "info");

    const prefix = data.kind === "report" ? "compte-rendu" : "resultat";
    return {
      filename: `medlink-${prefix}-${fileDate || data.id.slice(0, 8)}.pdf`,
      base64: Buffer.from(bytes).toString("base64"),
    };
  });
