// @ts-nocheck
// Fonction Edge Supabase (Deno).
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const DRY_RUN = Deno.env.get("SMS_DRY_RUN") === "true";
const CHANNEL = DRY_RUN ? "dry-run" : "sms";
const SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const FROM = Deno.env.get("TWILIO_FROM") ?? "";

const HOUR = 3600 * 1000;
const WINDOWS = [
  { kind: "24h", from: 23 * HOUR, to: 24 * HOUR, when: "demain" },
  { kind: "1h", from: 0, to: HOUR, when: "dans moins d'une heure" },
];

async function sendSms(to: string, body: string) {
  if (DRY_RUN) {
    console.log("[dry-run] rappel prêt, longueur du message:", body.length);
    return true;
  }
  if (!SID || !TOKEN || !FROM) {
    console.error("Secrets Twilio manquants");
    return false;
  }
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${SID}:${TOKEN}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: FROM, Body: body }),
  });
  if (!res.ok) console.error("SMS refusé, statut", res.status);
  return res.ok;
}

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  const now = Date.now();
  const stats = { dry_run: DRY_RUN, sent: 0, no_phone: 0, failed: 0, errors: 0 };

  for (const w of WINDOWS) {
    const { data: appts, error } = await supabase
      .from("appointments")
      .select("id, patient_id, starts_at")
      .in("status", ["scheduled", "confirmed"])
      .gt("starts_at", new Date(now + w.from).toISOString())
      .lte("starts_at", new Date(now + w.to).toISOString());
    if (error) { stats.errors++; console.error("appointments:", error.message); continue; }

    for (const a of appts ?? []) {
      const { data: prof, error: pErr } = await supabase
        .from("profiles").select("phone").eq("id", a.patient_id).maybeSingle();
      if (pErr) { stats.errors++; console.error("profiles:", pErr.message); continue; }
      if (!prof?.phone) { stats.no_phone++; continue; }

      // Réserve le rappel avant l'envoi : pas de doublon si deux exécutions se chevauchent
      const { error: claimErr } = await supabase
        .from("appointment_reminders")
        .insert({ appointment_id: String(a.id), kind: w.kind, channel: CHANNEL });
      if (claimErr) {
        if (claimErr.code !== "23505") { stats.errors++; console.error("reminders:", claimErr.message); }
        continue;
      }

      const d = new Date(a.starts_at);
      const day = d.toLocaleDateString("fr-FR", { timeZone: "Africa/Tunis", day: "2-digit", month: "2-digit" });
      const time = d.toLocaleTimeString("fr-FR", { timeZone: "Africa/Tunis", hour: "2-digit", minute: "2-digit" });
      // Message générique : ni médecin, ni spécialité
      const body = `MedLink : rappel de votre rendez-vous ${w.when}, le ${day} à ${time}.`;

      if (await sendSms(prof.phone, body)) {
        stats.sent++;
      } else {
        stats.failed++;
        await supabase.from("appointment_reminders")
          .delete().eq("appointment_id", String(a.id)).eq("kind", w.kind).eq("channel", CHANNEL);
      }
    }
  }

  return Response.json(stats);
});
