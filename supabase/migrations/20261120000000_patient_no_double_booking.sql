-- A patient cannot have two active appointments at the same time, even in two different
-- clinics or with two different practitioners. Applies to every way of booking (patient,
-- reschedule, reception) because it is enforced in the database.

create extension if not exists btree_gist with schema extensions;

-- 1. Clear error message, checked before the insert (book_appointment, reschedule_appointment,
--    staff_book_appointment all insert into appointments).
create or replace function public.reject_patient_double_booking()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('scheduled', 'confirmed') and exists (
    select 1 from public.appointments a
     where a.patient_id = new.patient_id
       and a.id <> new.id
       and a.status in ('scheduled', 'confirmed')
       and a.starts_at < new.ends_at and a.ends_at > new.starts_at
  ) then
    raise exception 'PATIENT_BUSY';
  end if;
  return new;
end $$;
revoke execute on function public.reject_patient_double_booking() from public, anon, authenticated;

drop trigger if exists appointments_patient_not_busy on public.appointments;
create trigger appointments_patient_not_busy
  before insert or update of starts_at, ends_at, status, patient_id on public.appointments
  for each row execute function public.reject_patient_double_booking();

-- 2. Guarantee under concurrency: two bookings sent at the same instant cannot both pass.
alter table public.appointments drop constraint if exists appointments_patient_no_overlap;
alter table public.appointments add constraint appointments_patient_no_overlap
  exclude using gist (
    patient_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('scheduled', 'confirmed'));
