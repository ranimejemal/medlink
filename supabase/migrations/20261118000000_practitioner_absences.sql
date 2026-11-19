-- US-21: a practitioner blocks a period (leave, training, absence). During that period no slot
-- can be created and no appointment can be booked, whatever the path (patient booking, reschedule,
-- reception booking): two triggers enforce it in the database.

create table if not exists public.practitioner_absences (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint absence_period_valid check (ends_at > starts_at and ends_at - starts_at <= interval '120 days'),
  constraint absence_reason_length check (reason is null or length(reason) <= 200)
);
create index if not exists practitioner_absences_period
  on public.practitioner_absences (practitioner_id, starts_at, ends_at);

alter table public.practitioner_absences enable row level security;
-- Since Oct 30 2026 Supabase requires explicit grants on new tables in "public".
-- Inserts go through block_period() only; deleting an absence = unblocking it.
grant select, delete on public.practitioner_absences to authenticated;
grant all on public.practitioner_absences to service_role;

drop policy if exists "absences read" on public.practitioner_absences;
create policy "absences read" on public.practitioner_absences for select to authenticated
  using ((practitioner_id = public.current_practitioner_id() and public.is_aal2())
         or public.is_staff() or public.is_admin());

drop policy if exists "absences delete" on public.practitioner_absences;
create policy "absences delete" on public.practitioner_absences for delete to authenticated
  using ((practitioner_id = public.current_practitioner_id() and public.is_aal2())
         or public.is_staff() or public.is_admin());

-- Blocks a period for the signed-in practitioner (or, for staff/admin, the practitioner given).
-- Returns the absence id, how many free slots were removed, and the appointments already booked
-- in the period (they are NOT cancelled automatically: the practitioner decides, patients are
-- notified by cancel_appointment()).
create or replace function public.block_period(
  _starts timestamptz, _ends timestamptz, _reason text default null, _practitioner uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pid uuid; new_id uuid; removed int; conflicts jsonb;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN'; end if;
  if _practitioner is not null and (public.is_staff() or public.is_admin()) then
    pid := _practitioner;
  elsif public.is_aal2() then
    pid := public.current_practitioner_id();
  end if;
  if pid is null then raise exception 'FORBIDDEN'; end if;
  if _starts is null or _ends is null or _ends <= _starts or _ends < now()
     or _ends - _starts > interval '120 days' then
    raise exception 'INVALID_PERIOD';
  end if;
  if length(coalesce(_reason, '')) > 200 then raise exception 'INVALID_REASON'; end if;

  insert into public.practitioner_absences (practitioner_id, starts_at, ends_at, reason)
  values (pid, _starts, _ends, nullif(trim(_reason), ''))
  returning id into new_id;

  delete from public.availability_slots
   where practitioner_id = pid and not is_booked and starts_at < _ends and ends_at > _starts;
  get diagnostics removed = row_count;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'starts_at', a.starts_at,
           'patient', upper(p.last_name) || ' ' || p.first_name) order by a.starts_at), '[]'::jsonb)
    into conflicts
    from public.appointments a join public.profiles p on p.id = a.patient_id
   where a.practitioner_id = pid and a.status in ('scheduled', 'confirmed')
     and a.starts_at < _ends and a.ends_at > _starts;

  perform public.write_audit('absence.created', 'practitioner', pid::text,
    jsonb_build_object('absence', new_id, 'starts_at', _starts, 'ends_at', _ends,
                       'removed_slots', removed, 'booked_appointments', jsonb_array_length(conflicts)));
  return jsonb_build_object('absence_id', new_id, 'removed_slots', removed, 'conflicts', conflicts);
end $$;
revoke execute on function public.block_period(timestamptz, timestamptz, text, uuid) from public, anon;
grant execute on function public.block_period(timestamptz, timestamptz, text, uuid) to authenticated;

-- No slot can be published during an absence ...
create or replace function public.reject_slot_during_absence()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.practitioner_absences ab
              where ab.practitioner_id = new.practitioner_id
                and ab.starts_at < new.ends_at and ab.ends_at > new.starts_at) then
    raise exception 'PRACTITIONER_ABSENT';
  end if;
  return new;
end $$;
drop trigger if exists slots_not_during_absence on public.availability_slots;
create trigger slots_not_during_absence before insert or update of starts_at, ends_at, practitioner_id
  on public.availability_slots for each row execute function public.reject_slot_during_absence();

-- ... and no appointment can be created during an absence (patient, reschedule or reception).
create or replace function public.reject_appointment_during_absence()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.practitioner_absences ab
              where ab.practitioner_id = new.practitioner_id
                and ab.starts_at < new.ends_at and ab.ends_at > new.starts_at) then
    raise exception 'PRACTITIONER_ABSENT';
  end if;
  return new;
end $$;
drop trigger if exists appointments_not_during_absence on public.appointments;
create trigger appointments_not_during_absence before insert on public.appointments
  for each row execute function public.reject_appointment_during_absence();

-- Unblocking a period is audited.
create or replace function public.audit_absence_deleted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.write_audit('absence.deleted', 'practitioner', old.practitioner_id::text,
    jsonb_build_object('absence', old.id, 'starts_at', old.starts_at, 'ends_at', old.ends_at));
  return null;
end $$;
drop trigger if exists audit_absence_deleted on public.practitioner_absences;
create trigger audit_absence_deleted after delete on public.practitioner_absences
  for each row execute function public.audit_absence_deleted();

revoke execute on function public.reject_slot_during_absence(), public.reject_appointment_during_absence(),
  public.audit_absence_deleted() from public, anon, authenticated;
