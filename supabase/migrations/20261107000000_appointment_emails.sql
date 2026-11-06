-- US-08 (confirmation), US-12 / US-48 (reminder 24 h before).
-- A scheduled job (POST /api/cron/appointment-emails, every minute) calls claim_appointment_emails().
-- The function marks each appointment as sent *before* returning it, so an e-mail is sent once
-- even if two jobs run at the same time (FOR UPDATE SKIP LOCKED).

alter table public.appointments
  add column if not exists confirmation_sent_at timestamptz,
  add column if not exists reminder_sent_at timestamptz;

-- Appointments that already exist are not e-mailed retroactively.
update public.appointments set confirmation_sent_at = now() where confirmation_sent_at is null;
update public.appointments set reminder_sent_at = now()
  where reminder_sent_at is null and starts_at < now() + interval '24 hours';

create index if not exists appointments_emails_pending on public.appointments (starts_at)
  where status in ('scheduled', 'confirmed') and (confirmation_sent_at is null or reminder_sent_at is null);

create or replace function public.claim_appointment_emails(_limit int default 50)
returns table (
  kind text,
  appointment_id uuid,
  patient_id uuid,
  email text,
  first_name text,
  notify_email boolean,
  starts_at timestamptz,
  ends_at timestamptz,
  practitioner text,
  clinic_name text,
  clinic_address text,
  clinic_city text,
  clinic_phone text
)
language sql volatile security definer set search_path = public as $$
  with
  -- US-08: new bookings. If the appointment is less than 24 h away, the confirmation
  -- also counts as the reminder, so the patient does not get two e-mails.
  confirmed as (
    update public.appointments a
       set confirmation_sent_at = now(),
           reminder_sent_at = case when a.starts_at <= now() + interval '24 hours'
                                   then coalesce(a.reminder_sent_at, now()) else a.reminder_sent_at end
     where a.id in (select id from public.appointments
                     where confirmation_sent_at is null and status in ('scheduled', 'confirmed')
                       and starts_at > now()
                     order by created_at limit _limit for update skip locked)
    returning a.id, a.patient_id, a.practitioner_id, a.clinic_id, a.starts_at, a.ends_at, 'confirmation'::text as k
  ),
  -- US-12 / US-48: appointments starting within 24 h, reminded once.
  reminded as (
    update public.appointments a
       set reminder_sent_at = now()
     where a.id in (select id from public.appointments
                     where reminder_sent_at is null and confirmation_sent_at is not null
                       and status in ('scheduled', 'confirmed')
                       and starts_at > now() and starts_at <= now() + interval '24 hours'
                     order by starts_at limit _limit for update skip locked)
    returning a.id, a.patient_id, a.practitioner_id, a.clinic_id, a.starts_at, a.ends_at, 'reminder'::text as k
  ),
  -- The reminder also appears in the app, even for patients who turned e-mails off.
  in_app as (
    insert into public.notifications (user_id, type, title, message)
    select r.patient_id, 'reminder', 'Rappel de rendez-vous',
           'Votre rendez-vous du ' || to_char(r.starts_at at time zone 'Africa/Tunis', 'DD/MM/YYYY à HH24:MI')
           || ' a lieu dans moins de 24 h.'
      from reminded r
  ),
  claimed as (select * from confirmed union all select * from reminded)
  select c.k, c.id, c.patient_id, p.email, p.first_name, p.notify_email, c.starts_at, c.ends_at,
         trim(pr.title || ' ' || pr.first_name || ' ' || pr.last_name),
         cl.name, cl.address, cl.city, cl.phone
    from claimed c
    join public.profiles p on p.id = c.patient_id
    join public.practitioners pr on pr.id = c.practitioner_id
    join public.clinics cl on cl.id = c.clinic_id
$$;

-- Only the server (service role) may run the job.
revoke all on function public.claim_appointment_emails(int) from public, anon, authenticated;
grant execute on function public.claim_appointment_emails(int) to service_role;
