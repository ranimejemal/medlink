import { createFileRoute } from "@tanstack/react-router";

// Liveness probe (Docker HEALTHCHECK, Kubernetes livenessProbe, uptime monitors).
// Answers as long as the Node process is running; it does not call the database, so a
// Supabase outage never makes Kubernetes restart healthy pods. See /api/ready for that.
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () =>
        Response.json(
          { status: "ok", uptime_s: Math.round(process.uptime()) },
          { headers: { "Cache-Control": "no-store" } },
        ),
    },
  },
});
