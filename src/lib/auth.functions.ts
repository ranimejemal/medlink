import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

function clientIp(): string | null {
  const req = getRequest();
  return req?.headers.get("cf-connecting-ip") ?? req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/**
 * Server-side login with brute-force protection: 5 failed attempts within
 * 15 minutes lock the account. Every attempt is recorded and audited with IP.
 */
export const secureSignIn = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ email: z.string().trim().toLowerCase().email().max(255), password: z.string().min(1).max(128) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createClient } = await import("@supabase/supabase-js");
    const ip = clientIp();
    const since = new Date(Date.now() - LOCK_MINUTES * 60_000).toISOString();

    const { count } = await supabaseAdmin
      .from("login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("email", data.email)
      .eq("success", false)
      .gte("created_at", since);

    if ((count ?? 0) >= MAX_FAILURES) {
      await supabaseAdmin.from("audit_logs").insert({
        user_email: data.email, action: "auth.login_blocked", severity: "critical", ip_address: ip,
      });
      return { ok: false as const, error: `Compte temporairement verrouillé après plusieurs tentatives. Réessayez dans ${LOCK_MINUTES} minutes.` };
    }

    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const client = createClient(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: auth, error } = await client.auth.signInWithPassword({ email: data.email, password: data.password });

    if (error || !auth.session) {
      await supabaseAdmin.from("login_attempts").insert({ email: data.email, ip_address: ip, success: false });
      await supabaseAdmin.from("audit_logs").insert({
        user_email: data.email, action: "auth.login_failed", severity: "warning", ip_address: ip,
      });
      const unconfirmed = error?.message?.toLowerCase().includes("not confirmed");
      return {
        ok: false as const,
        error: unconfirmed ? "Veuillez confirmer votre adresse e-mail avant de vous connecter." : "Identifiants invalides.",
      };
    }

    const { data: profile } = await supabaseAdmin.from("profiles").select("is_active").eq("id", auth.user.id).maybeSingle();
    if (profile && !profile.is_active) {
      await supabaseAdmin.from("audit_logs").insert({
        user_id: auth.user.id, user_email: data.email, action: "auth.login_inactive", severity: "warning", ip_address: ip,
      });
      return { ok: false as const, error: "Ce compte est désactivé. Contactez l'administration." };
    }

    await supabaseAdmin.from("login_attempts").insert({ email: data.email, ip_address: ip, success: true });
    await supabaseAdmin.from("audit_logs").insert({
      user_id: auth.user.id, user_email: data.email, action: "auth.login_success", ip_address: ip,
    });
    return {
      ok: true as const,
      access_token: auth.session.access_token,
      refresh_token: auth.session.refresh_token,
    };
  });

/** Records a security event for the signed-in user (logout, MFA, password change) with IP. */
export const logSecurityEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      action: z.enum(["auth.logout", "auth.session_expired", "mfa.enrolled", "mfa.verified", "mfa.failed", "password.changed", "access.denied", "record.viewed"]),
      entityId: z.string().max(64).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await context.supabase.rpc("write_audit", {
      _action: data.action,
      _entity: data.action.split(".")[0] ?? "auth",
      _entity_id: data.entityId ?? "",
      _details: null as never,
      _severity: data.action === "mfa.failed" || data.action === "access.denied" ? "warning" : "info",
      _ip: clientIp() ?? "",
    });
    return { ok: true };
  });
