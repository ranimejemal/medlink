-- US-08 / US-12 / US-48 when the app runs on a host without a "cron" container (e.g. Vercel):
-- the database calls POST <app_url>/api/cron/appointment-emails every minute (pg_cron + pg_net).
-- The site address and CRON_SECRET are read from Supabase Vault (US-45), never from the code.
-- Until both Vault secrets exist, the job does nothing. Running it alongside the Docker "cron"
-- service is safe: claim_appointment_emails() sends each e-mail only once.
--
-- To enable it (SQL Editor, once):
--   select vault.create_secret('https://your-app.vercel.app', 'app_url');
--   select vault.create_secret('<same value as CRON_SECRET in the app>', 'cron_secret');

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create or replace function private.trigger_appointment_emails()
returns bigint language plpgsql security definer set search_path = '' as $$
declare base text; secret text;
begin
  select decrypted_secret into base from vault.decrypted_secrets where name = 'app_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_secret';
  if base is null or secret is null then return null; end if;
  return net.http_post(
    url := rtrim(base, '/') || '/api/cron/appointment-emails',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret, 'Content-Type', 'application/json'),
    timeout_milliseconds := 30000
  );
end $$;
revoke all on function private.trigger_appointment_emails() from public, anon, authenticated;

-- Every minute, like the Docker "cron" service. Re-running this migration updates the same job.
select cron.schedule('medlink-appointment-emails', '* * * * *',
  'select private.trigger_appointment_emails()');
