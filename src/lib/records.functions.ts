import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * US-23: called before a practitioner's record page loads. The database checks the
 * practitioner–patient link and writes record.viewed (or record.denied) with the client IP.
 */
export const openPatientRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ patientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const req = getRequest();
    const ip = req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    const { data: allowed, error } = await context.supabase.rpc("log_record_access", {
      _patient: data.patientId,
      _ip: ip,
    });
    if (error) {
      console.error(error);
      return { allowed: false };
    }
    return { allowed: allowed === true };
  });
