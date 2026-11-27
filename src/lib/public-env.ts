// Public settings of the browser app (never secrets).
// - Vercel / Docker: baked in at build time (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY).
// - Kubernetes: read at run time from /env.js, written by the frontend container when it starts,
//   so the same image works on any cluster (each cluster has its own keys).
type PublicEnv = { SUPABASE_URL?: string; SUPABASE_PUBLISHABLE_KEY?: string };

function runtimeEnv(): PublicEnv {
  if (typeof window === "undefined") return {};
  return (window as unknown as { __MEDLINK_ENV__?: PublicEnv }).__MEDLINK_ENV__ ?? {};
}

/** True when the app was built for Kubernetes (settings from /env.js). */
export const RUNTIME_CONFIG = import.meta.env["VITE_RUNTIME_CONFIG"] === "1";

export function publicSupabaseUrl(): string | undefined {
  return runtimeEnv().SUPABASE_URL || import.meta.env["VITE_SUPABASE_URL"] || undefined;
}

export function publicSupabaseKey(): string | undefined {
  return (
    runtimeEnv().SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    undefined
  );
}
