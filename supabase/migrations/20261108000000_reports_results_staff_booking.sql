-- US-24 / US-25: a report or result can only become "validated" through validate_report() /
-- validate_result() (diagnosis required, patient notified, audit written). The direct UPDATE
-- policies are tightened so a practitioner cannot flip the status by hand.
drop policy if exists "practitioner update draft reports" on public.consultation_reports;
create policy "practitioner update draft reports" on public.consultation_reports for update to authenticated
  using (practitioner_id = public.current_practitioner_id() and public.is_aal2() and status = 'draft')
  with check (practitioner_id = public.current_practitioner_id() and status = 'draft');

drop policy if exists "practitioner update own results" on public.medical_results;
create policy "practitioner update own results" on public.medical_results for update to authenticated
  using (practitioner_id = public.current_practitioner_id() and public.is_aal2() and status = 'pending')
  with check (practitioner_id = public.current_practitioner_id() and status = 'pending');

-- US-29: a practitioner publishes availabilities only in the clinics he is assigned to.
drop policy if exists "practitioner manage own slots" on public.availability_slots;
create policy "practitioner manage own slots" on public.availability_slots for all to authenticated
  using (practitioner_id = public.current_practitioner_id() and public.is_aal2())
  with check (
    practitioner_id = public.current_practitioner_id() and public.is_aal2()
    and exists (select 1 from public.practitioner_clinics pc
                 where pc.practitioner_id = availability_slots.practitioner_id
                   and pc.clinic_id = availability_slots.clinic_id)
  );

-- US-29: assigning / removing a clinic is audited.
create or replace function public.audit_practitioner_clinics()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.write_audit(
    case when tg_op = 'INSERT' then 'practitioner.clinic_assigned' else 'practitioner.clinic_removed' end,
    'practitioner', coalesce(new.practitioner_id, old.practitioner_id)::text,
    jsonb_build_object('clinic', coalesce(new.clinic_id, old.clinic_id)), 'info');
  return null;
end $$;
revoke execute on function public.audit_practitioner_clinics() from public, anon, authenticated;
drop trigger if exists audit_practitioner_clinics on public.practitioner_clinics;
create trigger audit_practitioner_clinics after insert or delete on public.practitioner_clinics
  for each row execute function public.audit_practitioner_clinics();

-- US-30: appointment created by the reception for a patient who phoned.
alter table public.appointments add column if not exists booked_by_staff uuid;

create or replace function public.staff_book_appointment(_patient uuid, _slot_id uuid, _reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare s record; new_id uuid; active_count int;
begin
  if auth.uid() is null or not (public.is_staff() or public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  if not public.has_role(_patient, 'patient') then raise exception 'NOT_FOUND'; end if;
  if length(coalesce(_reason, '')) > 500 then raise exception 'INVALID_REASON'; end if;
  select * into s from public.availability_slots where id = _slot_id for update;
  if not found then raise exception 'SLOT_NOT_FOUND'; end if;
  if s.is_booked then raise exception 'SLOT_TAKEN'; end if;
  if s.starts_at < now() then raise exception 'SLOT_TOO_SOON'; end if;
  select count(*) into active_count from public.appointments
   where patient_id = _patient and status in ('scheduled', 'confirmed') and starts_at > now();
  if active_count >= 5 then raise exception 'TOO_MANY_APPOINTMENTS'; end if;

  update public.availability_slots set is_booked = true where id = _slot_id;
  insert into public.appointments (patient_id, practitioner_id, clinic_id, slot_id, starts_at, ends_at, reason, booked_by_staff)
  values (_patient, s.practitioner_id, s.clinic_id, s.id, s.starts_at, s.ends_at, nullif(trim(_reason), ''), auth.uid())
  returning id into new_id;

  perform public.notify(_patient, 'appointment', 'Rendez-vous pris par l''accueil',
    'L''accueil a enregistré votre rendez-vous du '
    || to_char(s.starts_at at time zone 'Africa/Tunis', 'DD/MM/YYYY à HH24:MI') || '.');
  perform public.notify(p.user_id, 'appointment', 'Nouveau rendez-vous',
    'L''accueil a réservé le créneau du '
    || to_char(s.starts_at at time zone 'Africa/Tunis', 'DD/MM/YYYY à HH24:MI') || '.')
    from public.practitioners p where p.id = s.practitioner_id and p.user_id is not null;
  perform public.write_audit('appointment.booked_by_staff', 'appointment', new_id::text,
    jsonb_build_object('patient', _patient, 'slot', _slot_id));
  return new_id;
end $$;
revoke execute on function public.staff_book_appointment(uuid, uuid, text) from public, anon;
grant execute on function public.staff_book_appointment(uuid, uuid, text) to authenticated;

-- US-30: the reception searches the patient who phones (identity only, no medical data).
create or replace function public.staff_search_patients(_q text)
returns table (id uuid, first_name text, last_name text, email text, phone text, date_of_birth date)
language plpgsql stable security definer set search_path = public as $$
declare q text := '%' || lower(trim(coalesce(_q, ''))) || '%';
begin
  if not (public.is_staff() or public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  if length(trim(coalesce(_q, ''))) < 2 then return; end if;
  return query
    select p.id, p.first_name, p.last_name, p.email, p.phone, p.date_of_birth
      from public.profiles p
     where p.is_active
       and exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'patient')
       and (lower(p.first_name || ' ' || p.last_name) like q or lower(p.last_name || ' ' || p.first_name) like q
            or lower(p.email) like q or coalesce(p.phone, '') like q)
     order by p.last_name, p.first_name
     limit 20;
end $$;
revoke execute on function public.staff_search_patients(text) from public, anon;
grant execute on function public.staff_search_patients(text) to authenticated;
