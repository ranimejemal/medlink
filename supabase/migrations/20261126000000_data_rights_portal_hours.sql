-- US-16: a patient exports all his data and can delete his account.
-- US-49: the portal is open from 6:00 to 22:00 (Tunis time); outside these hours no appointment
--        can be booked and a message explains why. An administrator can switch the rule off.

-- ========== US-49: opening hours ==========
create table if not exists public.portal_hours (
  id boolean primary key default true check (id), -- a single row
  open_hour smallint not null default 6 check (open_hour between 0 and 23),
  close_hour smallint not null default 22 check (close_hour between 1 and 24),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint portal_hours_order check (close_hour > open_hour)
);
insert into public.portal_hours (id) values (true) on conflict (id) do nothing;

alter table public.portal_hours enable row level security;
grant select on public.portal_hours to anon, authenticated;
grant update (open_hour, close_hour, enabled) on public.portal_hours to authenticated;
grant all on public.portal_hours to service_role;

drop policy if exists "portal hours read" on public.portal_hours;
create policy "portal hours read" on public.portal_hours for select to anon, authenticated using (true);
drop policy if exists "portal hours admin update" on public.portal_hours;
create policy "portal hours admin update" on public.portal_hours for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.portal_is_open(_at timestamptz default now())
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select not h.enabled
        or extract(hour from (_at at time zone 'Africa/Tunis')) >= h.open_hour
       and extract(hour from (_at at time zone 'Africa/Tunis')) < h.close_hour
      from public.portal_hours h), true)
$$;
grant execute on function public.portal_is_open(timestamptz) to anon, authenticated;

-- Every booking path (patient, reschedule, reception) inserts into appointments: one trigger covers all.
-- Server jobs (no signed-in user) are not affected.
create or replace function public.reject_booking_outside_hours()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.portal_is_open() then
    raise exception 'PORTAL_CLOSED';
  end if;
  return new;
end $$;
revoke execute on function public.reject_booking_outside_hours() from public, anon, authenticated;
drop trigger if exists appointments_portal_hours on public.appointments;
create trigger appointments_portal_hours before insert on public.appointments
  for each row execute function public.reject_booking_outside_hours();

create or replace function public.audit_portal_hours()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  perform public.write_audit('portal.hours_changed', 'portal_hours', null,
    jsonb_build_object('open_hour', new.open_hour, 'close_hour', new.close_hour, 'enabled', new.enabled),
    'warning');
  return new;
end $$;
revoke execute on function public.audit_portal_hours() from public, anon, authenticated;
drop trigger if exists audit_portal_hours on public.portal_hours;
create trigger audit_portal_hours before update on public.portal_hours
  for each row execute function public.audit_portal_hours();

-- ========== US-16: export of my data ==========
create or replace function public.export_my_data()
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); result jsonb;
begin
  if uid is null or not public.has_role(uid, 'patient') then raise exception 'FORBIDDEN'; end if;

  select jsonb_build_object(
    'generated_at', now(),
    'format', 'MedLink export v1',
    'profile', (select to_jsonb(p) - 'id' from public.profiles p where p.id = uid),
    'medical_record', (select to_jsonb(m) - 'id' - 'patient_id'
                         from public.medical_records_decrypted m where m.patient_id = uid),
    'appointments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'starts_at', a.starts_at, 'ends_at', a.ends_at, 'status', a.status, 'reason', a.reason,
               'practitioner', trim(pr.title || ' ' || pr.first_name || ' ' || pr.last_name),
               'clinic', c.name, 'created_at', a.created_at) order by a.starts_at desc)
        from public.appointments a
        join public.practitioners pr on pr.id = a.practitioner_id
        join public.clinics c on c.id = a.clinic_id
       where a.patient_id = uid), '[]'::jsonb),
    'consultation_reports', coalesce((
      select jsonb_agg(jsonb_build_object(
               'validated_at', r.validated_at, 'reason', r.reason, 'observations', r.observations,
               'diagnosis', r.diagnosis, 'prescription', r.prescription,
               'recommendations', r.recommendations) order by r.validated_at desc)
        from public.consultation_reports_decrypted r
       where r.patient_id = uid and r.status = 'validated'), '[]'::jsonb),
    'medical_results', coalesce((
      select jsonb_agg(jsonb_build_object(
               'result_date', m.result_date, 'title', m.title, 'category', m.category,
               'summary', m.summary, 'values', m.values_json) order by m.result_date desc)
        from public.medical_results_decrypted m
       where m.patient_id = uid and m.status = 'validated'), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', d.name, 'category', d.category, 'mime_type', d.mime_type, 'size_bytes', d.size_bytes,
               'shared_with_doctor', d.shared_with_doctor, 'created_at', d.created_at) order by d.created_at desc)
        from public.patient_documents d where d.patient_id = uid), '[]'::jsonb),
    'appointment_requests', coalesce((
      select jsonb_agg(jsonb_build_object(
               'created_at', q.created_at, 'notes', q.raw_notes, 'summary', q.summary,
               'urgency', q.urgency, 'status', q.status) order by q.created_at desc)
        from public.appointment_requests q where q.patient_id = uid), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object('created_at', n.created_at, 'title', n.title, 'message', n.message)
             order by n.created_at desc)
        from public.notifications n where n.user_id = uid), '[]'::jsonb),
    'activity_log', coalesce((
      select jsonb_agg(jsonb_build_object('at', l.created_at, 'action', l.action, 'ip', l.ip_address)
             order by l.created_at desc)
        from public.audit_logs l
       where l.user_id = uid and l.created_at > now() - interval '12 months'), '[]'::jsonb)
  ) into result;
  perform public.write_audit('data.exported', 'user', uid::text, null, 'info');
  return result;
end $$;
revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

-- ========== US-16: deletion of my account ==========
-- Removes or anonymizes everything that identifies the patient. Consultation reports, results and
-- the medical record are KEPT (legal retention of the medical file) but are no longer linked to a
-- name, e-mail, phone or birth date. The server then deletes the login (auth.users) and the files.
create or replace function public.delete_my_account(_confirm text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); a record; cancelled int := 0; files jsonb;
begin
  if uid is null or not public.has_role(uid, 'patient') then raise exception 'FORBIDDEN'; end if;
  if _confirm is distinct from 'SUPPRIMER' then raise exception 'CONFIRMATION_REQUIRED'; end if;

  -- Future appointments are cancelled (no 24 h limit here), slots freed, practitioners told.
  for a in select * from public.appointments
            where patient_id = uid and status in ('scheduled', 'confirmed') and starts_at > now()
            for update loop
    update public.appointments set status = 'cancelled', cancelled_at = now(), cancelled_by = uid,
           updated_at = now() where id = a.id;
    update public.availability_slots set is_booked = false where id = a.slot_id;
    perform public.notify(p.user_id, 'cancellation', 'Rendez-vous annulé',
      'Le rendez-vous du ' || to_char(a.starts_at at time zone 'Africa/Tunis', 'DD/MM/YYYY à HH24:MI')
      || ' a été annulé (compte patient supprimé).')
      from public.practitioners p where p.id = a.practitioner_id and p.user_id is not null;
    cancelled := cancelled + 1;
  end loop;

  -- Files uploaded by the patient: the rows go now, the server removes the files from Storage.
  select coalesce(jsonb_agg(storage_path), '[]'::jsonb) into files
    from public.patient_documents where patient_id = uid;
  delete from public.patient_documents where patient_id = uid;
  delete from public.notifications where user_id = uid;
  delete from public.appointment_requests where patient_id = uid;

  update public.profiles
     set email = 'supprime-' || uid || '@medlink.invalid', first_name = 'Patient', last_name = 'supprimé',
         phone = null, date_of_birth = null, is_active = false, notify_email = false, notify_sms = false,
         updated_at = now()
   where id = uid;

  perform public.write_audit('account.deletion_requested', 'user', uid::text,
    jsonb_build_object('cancelled_appointments', cancelled, 'files', jsonb_array_length(files)), 'warning');
  return jsonb_build_object('cancelled_appointments', cancelled, 'files', files);
end $$;
revoke execute on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;
