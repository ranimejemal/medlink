import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { buildAppointmentEmail, type AppointmentEmailRow } from "@/lib/appointment-emails";

// US-08 / US-12 / US-48: called every minute by the "cron" service (docker-compose.yml)
// with "Authorization: Bearer $CRON_SECRET". Sends the confirmations of new bookings and
// the reminders of appointments starting within 24 h. Each e-mail is sent once.
export const Route = createFileRoute("/api/cron/appointment-emails")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        const { smtpConfig, sendMail } = await import("@/lib/mailer.server");
        // Check SMTP before claiming, otherwise appointments would be marked sent without an e-mail.
        if (!smtpConfig()) return Response.json({ error: "SMTP not configured" }, { status: 500 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("claim_appointment_emails", {
          _limit: 50,
        });
        if (error) {
          console.error("[cron] claim_appointment_emails", error);
          return Response.json({ error: "claim failed" }, { status: 500 });
        }

        const siteUrl = (process.env["SITE_URL"] ?? "").replace(/\/$/, "");
        const result = { sent: 0, skipped: 0, failed: 0 };
        for (const row of data ?? []) {
          let action: "email.sent" | "email.skipped" | "email.failed";
          if (!row.notify_email || !row.email) {
            action = "email.skipped"; // US-15: the patient turned e-mails off
          } else {
            try {
              const mail = buildAppointmentEmail(row as AppointmentEmailRow, siteUrl);
              await sendMail({ to: row.email, ...mail });
              action = "email.sent";
            } catch (e) {
              console.error("[cron] e-mail failed", row.appointment_id, e);
              action = "email.failed";
            }
          }
          result[
            action === "email.sent" ? "sent" : action === "email.skipped" ? "skipped" : "failed"
          ]++;
          await supabaseAdmin.rpc("write_audit", {
            _action: action,
            _entity: "appointment",
            _entity_id: row.appointment_id,
            _details: { kind: row.kind, patient: row.patient_id },
            _severity: action === "email.failed" ? "warning" : "info",
          });
        }
        return Response.json(result);
      },
    },
  },
});
