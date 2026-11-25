import { createFileRoute } from "@tanstack/react-router";

const TIMEOUT_MS = 3000;

// Readiness probe (Kubernetes readinessProbe): 200 when the database answers, 503 otherwise.
// A pod that is not ready stops receiving traffic but is not restarted.
// No error detail is returned (OWASP A05): only "ok" / "unavailable".
export const Route = createFileRoute("/api/ready")({
  server: {
    handlers: {
      GET: async () => {
        const headers = { "Cache-Control": "no-store" };
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const check = supabaseAdmin.from("clinics").select("id", { head: true }).limit(1);
          const timeout = new Promise<{ error: Error }>((resolve) =>
            setTimeout(() => resolve({ error: new Error("timeout") }), TIMEOUT_MS),
          );
          const { error } = await Promise.race([check, timeout]);
          if (error) throw error;
          return Response.json({ status: "ok", database: "ok" }, { headers });
        } catch (e) {
          console.error("[ready] database check failed", e);
          return Response.json(
            { status: "unavailable", database: "unavailable" },
            { status: 503, headers },
          );
        }
      },
    },
  },
});
