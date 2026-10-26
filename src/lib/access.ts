import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { logSecurityEvent } from "@/lib/auth.functions";

export type AppRole = "patient" | "practitioner" | "admin" | "staff";

export interface Access {
  userId: string;
  email: string;
  roles: AppRole[];
  aal: "aal1" | "aal2";
  mfaEnrolled: boolean;
}

/** Loads the current user's roles and MFA assurance level. Client-side UX gate only; RLS enforces data access. */
export async function loadAccess(): Promise<Access | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const [{ data: roles }, { data: aal }, { data: factors }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", data.user.id),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);
  return {
    userId: data.user.id,
    email: data.user.email ?? "",
    roles: (roles ?? []).map((r) => r.role as AppRole),
    aal: (aal?.currentLevel ?? "aal1") as "aal1" | "aal2",
    mfaEnrolled: (factors?.totp ?? []).some((f) => f.status === "verified"),
  };
}

export function homeFor(roles: AppRole[]): string {
  if (roles.includes("admin")) return "/admin/dashboard";
  if (roles.includes("practitioner")) return "/practitioner/dashboard";
  if (roles.includes("staff")) return "/staff/dashboard";
  return "/patient/dashboard";
}

export const MFA_REQUIRED: AppRole[] = ["practitioner", "admin"];

/** Shared beforeLoad guard for role areas: enforces role and, for sensitive roles, verified MFA (AAL2). */
export async function requireRole(role: AppRole) {
  const access = await loadAccess();
  if (!access) throw redirect({ to: "/login" });
  if (!access.roles.includes(role)) {
    // US-39: a refused access must be written to the audit log.
    try {
      await logSecurityEvent({ data: { action: "access.denied", entityId: role } });
    } catch {
      /* best effort: never block the redirect */
    }
    throw redirect({ to: "/unauthorized" });
  }
  if (MFA_REQUIRED.includes(role) && access.aal !== "aal2") throw redirect({ to: "/mfa" });
  return { access };
}

/** Where an already signed-in visitor of "/" or "/login" should be sent (null = nobody signed in). */
export async function signedInDestination(): Promise<string | null> {
  const access = await loadAccess();
  if (!access || access.roles.length === 0) return null;
  if (access.roles.some((r) => MFA_REQUIRED.includes(r)) && access.aal !== "aal2") return "/mfa";
  return homeFor(access.roles);
}
