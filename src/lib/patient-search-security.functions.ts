import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { detectSqlInjection } from "@/lib/sql-injection-detector";

export const checkPatientSearchSecurity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        search: z.string().max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: isPractitioner, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "practitioner",
    });

    if (roleError || !isPractitioner) {
      throw new Error("Accès praticien refusé");
    }

    const suspicious = detectSqlInjection(data.search);

    if (suspicious) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { getRequestIP } = await import("@tanstack/react-start/server");

      const { error } = await supabaseAdmin.from("audit_logs").insert({
        user_id: context.userId,
        action: "security.sql_injection",
        entity: "patient_search",
        severity: "critical",
        ip_address: getRequestIP() ?? null,
        details: {
          is_test: true,
          detection: "suspicious_input",
          source: "practitioner_patient_search",
        },
      });

      if (error) {
        console.error("Erreur journalisation SQL Injection :", error);
        throw new Error("Journalisation impossible");
      }
    }

    return { suspicious };
  });
