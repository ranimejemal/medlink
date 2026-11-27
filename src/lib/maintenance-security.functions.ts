import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { detectSqlInjection } from "@/lib/sql-injection-detector";
import { detectXss } from "@/lib/xss-detector";

export const checkMaintenanceSecurity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      title: z.string().max(120),
      message: z.string().max(2000),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } =
      await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      });

    if (roleError || !isAdmin) {
      throw new Error("Accès administrateur refusé");
    }

    if (context.claims.aal !== "aal2") {
      throw new Error("Authentification MFA requise");
    }

    const input = `${data.title} ${data.message}`;
    const sqlSuspicious = detectSqlInjection(input);
    const xssSuspicious = detectXss(input);
    const suspicious = sqlSuspicious || xssSuspicious;

    if (suspicious) {
      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );
      const { getRequestIP } = await import(
        "@tanstack/react-start/server"
      );

      const { error } = await supabaseAdmin
        .from("audit_logs")
        .insert({
          user_id: context.userId,
          action: xssSuspicious
            ? "security.xss_attempt"
            : "security.sql_injection",
          entity: "maintenance",
          severity: "critical",
          ip_address: getRequestIP() ?? null,
          details: {
            is_test: true,
            detection: xssSuspicious ? "xss_pattern" : "sql_pattern",
          },
        });

      if (error) {
        console.error("Échec journalisation SQL Injection :", error);
        throw new Error("Journalisation de sécurité impossible");
      }
    }

    return {
      suspicious,
      threatType: xssSuspicious
        ? "xss"
        : sqlSuspicious
          ? "sql_injection"
          : null,
    };
  });
