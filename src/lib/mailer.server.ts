// Sends application e-mails (US-08, US-12) through the same SMTP account as Supabase Auth.
// Server only: the SMTP password comes from .env and never reaches the browser.
import nodemailer, { type Transporter } from "nodemailer";

export function smtpConfig() {
  const host = process.env["SMTP_HOST"];
  const user = process.env["SMTP_USER"];
  const pass = process.env["SMTP_PASS"];
  if (!host || !user || !pass) return null;
  const port = Number(process.env["SMTP_PORT"] || 465);
  return {
    host,
    port,
    secure: port === 465, // 465 = TLS from the start, 587 = STARTTLS
    requireTLS: port !== 465,
    auth: { user, pass },
    from: process.env["SMTP_FROM"] || `MedLink <${user}>`,
  };
}

let transport: Transporter | undefined;

export async function sendMail(msg: { to: string; subject: string; text: string; html: string }) {
  const cfg = smtpConfig();
  if (!cfg) throw new Error("SMTP_NOT_CONFIGURED");
  transport ??= nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    requireTLS: cfg.requireTLS,
    auth: cfg.auth,
  });
  await transport.sendMail({ from: cfg.from, ...msg });
}
