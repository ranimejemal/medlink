import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * US-27: records the invitation as the caller (admin_invite_user checks the role),
 * then e-mails the activation link. The person sets a password from that link.
 */
export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().trim().toLowerCase().email().max(255),
        role: z.enum(["patient", "practitioner", "admin", "staff"]),
        practitionerId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_invite_user", {
      _email: data.email,
      _role: data.role,
      ...(data.practitionerId ? { _practitioner: data.practitionerId } : {}),
    });
    if (error) return { ok: false as const, error: error.message };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // || (not ??) so an empty SITE_URL="" from .env.example also falls back
    const site = process.env["SITE_URL"] || new URL(getRequest().url).origin;
    const { error: mailError } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      redirectTo: `${site}/reset-password`,
    });
    if (mailError) {
      console.error(mailError);
      return { ok: false as const, error: "INVITE_EMAIL_FAILED" };
    }
    return { ok: true as const };
  });
