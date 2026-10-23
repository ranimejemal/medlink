-- MedLink baseline schema.
-- Replaces the three earlier migrations (schema + hardening + appointment_requests) with one file.
-- Apply on a NEW, empty Supabase project. Demo data lives in supabase/seed.sql, not here.
-- ========== ENUMS ==========
create type public.app_role as enum ('patient','practitioner','admin','staff');
create type public.appointment_status as enum ('scheduled','confirmed','cancelled','completed','no_show');
create type public.result_status as enum ('pending','validated');
create type public.report_status as enum ('draft','validated');

-- ========== CLINICS / SPECIALTIES ==========
create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  address text not null,
  phone text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.clinics to anon, authenticated;
grant insert, update, delete on public.clinics to authenticated;
grant all on public.clinics to service_role;
alter table public.clinics enable row level security;

create table public.specialties (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);
grant select on public.specialties to anon, authenticated;
grant insert, update, delete on public.specialties to authenticated;
grant all on public.specialties to service_role;
alter table public.specialties enable row level security;

-- ========== PROFILES / ROLES ==========
create table public.profiles (
  id uuid primary key,
  email text not null,
  first_name text not null default '',
  last_name text not null default '',
  phone text,
  date_of_birth date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

-- pre-provisioned staff accounts (admin creates, user activates by registering with that email)
create table public.account_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role public.app_role not null,
  practitioner_id uuid,
  created_by uuid,
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.account_invitations to authenticated;
grant all on public.account_invitations to service_role;
alter table public.account_invitations enable row level security;

-- ========== PRACTITIONERS ==========
create table public.practitioners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique,
  first_name text not null,
  last_name text not null,
  title text not null default 'Dr',
  specialty_id uuid not null references public.specialties(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.practitioners to anon, authenticated;
grant insert, update, delete on public.practitioners to authenticated;
grant all on public.practitioners to service_role;
alter table public.practitioners enable row level security;

create table public.practitioner_clinics (
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  primary key (practitioner_id, clinic_id)
);
grant select on public.practitioner_clinics to anon, authenticated;
grant insert, delete on public.practitioner_clinics to authenticated;
grant all on public.practitioner_clinics to service_role;
alter table public.practitioner_clinics enable row level security;

-- ========== SLOTS / APPOINTMENTS ==========
create table public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references public.practitioners(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_booked boolean not null default false,
  created_at timestamptz not null default now(),
  unique (practitioner_id, starts_at)
);
create index on public.availability_slots (starts_at);
grant select on public.availability_slots to authenticated;
grant insert, update, delete on public.availability_slots to authenticated;
grant all on public.availability_slots to service_role;
alter table public.availability_slots enable row level security;

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  practitioner_id uuid not null references public.practitioners(id),
  clinic_id uuid not null references public.clinics(id),
  slot_id uuid references public.availability_slots(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  status public.appointment_status not null default 'scheduled',
  cancelled_at timestamptz,
  cancelled_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index appointments_active_slot on public.appointments(slot_id) where status in ('scheduled','confirmed');
create index on public.appointments (patient_id);
create index on public.appointments (practitioner_id, starts_at);
grant select, update on public.appointments to authenticated;
grant all on public.appointments to service_role;
alter table public.appointments enable row level security;

-- ========== MEDICAL ==========
create table public.medical_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null unique,
  blood_type text,
  allergies text,
  chronic_conditions text,
  current_treatments text,
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.medical_records to authenticated;
grant all on public.medical_records to service_role;
alter table public.medical_records enable row level security;

create table public.medical_results (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  practitioner_id uuid references public.practitioners(id),
  clinic_id uuid references public.clinics(id),
  title text not null,
  category text not null,
  summary text not null,
  values_json jsonb,
  status public.result_status not null default 'pending',
  result_date date not null default current_date,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.medical_results to authenticated;
grant all on public.medical_results to service_role;
alter table public.medical_results enable row level security;

create table public.consultation_reports (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments(id),
  patient_id uuid not null,
  practitioner_id uuid not null references public.practitioners(id),
  reason text not null,
  observations text not null default '',
  diagnosis text not null default '',
  prescription text not null default '',
  recommendations text not null default '',
  status public.report_status not null default 'draft',
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.consultation_reports to authenticated;
grant all on public.consultation_reports to service_role;
alter table public.consultation_reports enable row level security;

-- ========== NOTIFICATIONS / AUDIT / SECURITY ==========
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type text not null,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);
grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  user_email text,
  action text not null,
  entity text,
  entity_id text,
  details jsonb,
  ip_address text,
  severity text not null default 'info',
  created_at timestamptz not null default now()
);
create index on public.audit_logs (created_at desc);
grant select on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;
alter table public.audit_logs enable row level security;

create table public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  ip_address text,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index on public.login_attempts (email, created_at desc);
grant all on public.login_attempts to service_role;
alter table public.login_attempts enable row level security;

-- ========== HELPER FUNCTIONS ==========
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_aal2()
returns boolean language sql stable set search_path = public as $$
  select coalesce(auth.jwt()->>'aal','aal1') = 'aal2'
$$;

create or replace function public.current_practitioner_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.practitioners where user_id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(),'admin') and public.is_aal2()
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(),'staff')
$$;

-- practitioner (MFA verified) linked to this patient by a consultation
create or replace function public.is_my_patient(_patient uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_aal2() and exists (
    select 1 from public.appointments a
    where a.patient_id = _patient and a.practitioner_id = public.current_practitioner_id()
  )
$$;

-- ========== POLICIES ==========
create policy "clinics readable" on public.clinics for select using (true);
create policy "admin manage clinics" on public.clinics for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "specialties readable" on public.specialties for select using (true);
create policy "admin manage specialties" on public.specialties for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "practitioner reads patient profile" on public.profiles for select to authenticated using (public.is_my_patient(id));
create policy "staff reads profiles" on public.profiles for select to authenticated using (public.is_staff() or public.is_admin());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "admin update profiles" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "own roles read" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.is_admin());

create policy "admin invitations" on public.account_invitations for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "practitioners readable" on public.practitioners for select using (true);
create policy "admin manage practitioners" on public.practitioners for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "pc readable" on public.practitioner_clinics for select using (true);
create policy "admin manage pc" on public.practitioner_clinics for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "slots readable" on public.availability_slots for select to authenticated using (true);
create policy "practitioner manage own slots" on public.availability_slots for all to authenticated
  using (practitioner_id = public.current_practitioner_id() and public.is_aal2())
  with check (practitioner_id = public.current_practitioner_id() and public.is_aal2());
create policy "staff manage slots" on public.availability_slots for all to authenticated
  using (public.is_staff() or public.is_admin()) with check (public.is_staff() or public.is_admin());

create policy "patient own appointments" on public.appointments for select to authenticated using (patient_id = auth.uid());
create policy "practitioner own appointments" on public.appointments for select to authenticated using (practitioner_id = public.current_practitioner_id() and public.is_aal2());
create policy "practitioner update own appointments" on public.appointments for update to authenticated
  using (practitioner_id = public.current_practitioner_id() and public.is_aal2())
  with check (practitioner_id = public.current_practitioner_id() and public.is_aal2());
create policy "staff admin appointments" on public.appointments for select to authenticated using (public.is_staff() or public.is_admin());
create policy "staff update appointments" on public.appointments for update to authenticated using (public.is_staff() or public.is_admin()) with check (public.is_staff() or public.is_admin());

create policy "patient own record" on public.medical_records for select to authenticated using (patient_id = auth.uid());
create policy "practitioner patient record" on public.medical_records for select to authenticated using (public.is_my_patient(patient_id));
create policy "practitioner insert record" on public.medical_records for insert to authenticated with check (public.is_my_patient(patient_id));
create policy "practitioner update record" on public.medical_records for update to authenticated using (public.is_my_patient(patient_id)) with check (public.is_my_patient(patient_id));

create policy "patient validated results" on public.medical_results for select to authenticated using (patient_id = auth.uid() and status = 'validated');
create policy "practitioner patient results" on public.medical_results for select to authenticated using (public.is_my_patient(patient_id));
create policy "practitioner insert results" on public.medical_results for insert to authenticated with check (public.is_my_patient(patient_id) and practitioner_id = public.current_practitioner_id());
create policy "practitioner update own results" on public.medical_results for update to authenticated using (practitioner_id = public.current_practitioner_id() and public.is_aal2()) with check (practitioner_id = public.current_practitioner_id());

create policy "patient validated reports" on public.consultation_reports for select to authenticated using (patient_id = auth.uid() and status = 'validated');
create policy "practitioner patient reports" on public.consultation_reports for select to authenticated using (public.is_my_patient(patient_id));
create policy "practitioner insert reports" on public.consultation_reports for insert to authenticated with check (practitioner_id = public.current_practitioner_id() and public.is_my_patient(patient_id));
create policy "practitioner update draft reports" on public.consultation_reports for update to authenticated
  using (practitioner_id = public.current_practitioner_id() and public.is_aal2() and status = 'draft')
  with check (practitioner_id = public.current_practitioner_id());

create policy "own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "own notifications update" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "admin audit read" on public.audit_logs for select to authenticated using (public.is_admin());
create policy "own audit read" on public.audit_logs for select to authenticated using (user_id = auth.uid());

-- ========== AUDIT HELPERS ==========
create or replace function public.write_audit(_action text, _entity text, _entity_id text, _details jsonb, _severity text default 'info', _ip text default null)
returns void language plpgsql security definer set search_path = public as $$
declare _email text;
begin
  select email into _email from public.profiles where id = auth.uid();
  insert into public.audit_logs(user_id,user_email,action,entity,entity_id,details,severity,ip_address)
  values (auth.uid(), _email, _action, _entity, _entity_id, _details, _severity, _ip);
end $$;
revoke execute on function public.write_audit(text,text,text,jsonb,text,text) from public, anon;
grant execute on function public.write_audit(text,text,text,jsonb,text,text) to authenticated, service_role;

create or replace function public.notify(_user uuid, _type text, _title text, _message text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications(user_id,type,title,message) values (_user,_type,_title,_message);
$$;
revoke execute on function public.notify(uuid,text,text,text) from public, anon, authenticated;

-- ========== NEW USER ==========
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare inv record;
begin
  insert into public.profiles(id,email,first_name,last_name,phone)
  values (new.id, new.email,
    coalesce(new.raw_user_meta_data->>'first_name',''),
    coalesce(new.raw_user_meta_data->>'last_name',''),
    new.raw_user_meta_data->>'phone');
  select * into inv from public.account_invitations where lower(email) = lower(new.email);
  if found then
    insert into public.user_roles(user_id, role) values (new.id, inv.role);
    if inv.practitioner_id is not null then
      update public.practitioners set user_id = new.id where id = inv.practitioner_id;
    end if;
    delete from public.account_invitations where id = inv.id;
  else
    insert into public.user_roles(user_id, role) values (new.id, 'patient');
    insert into public.medical_records(patient_id) values (new.id);
  end if;
  insert into public.audit_logs(user_id,user_email,action,entity,entity_id)
  values (new.id,new.email,'account.created','user',new.id::text);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ========== APPOINTMENT RPCs ==========
create or replace function public.book_appointment(_slot_id uuid, _reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare s record; new_id uuid; active_count int;
begin
  if auth.uid() is null or not public.has_role(auth.uid(),'patient') then raise exception 'FORBIDDEN'; end if;
  if length(coalesce(_reason,'')) > 500 then raise exception 'INVALID_REASON'; end if;
  select * into s from public.availability_slots where id = _slot_id for update;
  if not found then raise exception 'SLOT_NOT_FOUND'; end if;
  if s.is_booked then raise exception 'SLOT_TAKEN'; end if;
  if s.starts_at < now() + interval '1 hour' then raise exception 'SLOT_TOO_SOON'; end if;
  select count(*) into active_count from public.appointments where patient_id = auth.uid() and status in ('scheduled','confirmed') and starts_at > now();
  if active_count >= 5 then raise exception 'TOO_MANY_APPOINTMENTS'; end if;
  update public.availability_slots set is_booked = true where id = _slot_id;
  insert into public.appointments(patient_id,practitioner_id,clinic_id,slot_id,starts_at,ends_at,reason)
  values (auth.uid(), s.practitioner_id, s.clinic_id, s.id, s.starts_at, s.ends_at, nullif(trim(_reason),''))
  returning id into new_id;
  perform public.notify(auth.uid(),'appointment','Rendez-vous confirmé','Votre rendez-vous du '||to_char(s.starts_at at time zone 'Africa/Tunis','DD/MM/YYYY à HH24:MI')||' est enregistré.');
  perform public.notify(p.user_id,'appointment','Nouveau rendez-vous','Un patient a réservé le créneau du '||to_char(s.starts_at at time zone 'Africa/Tunis','DD/MM/YYYY à HH24:MI')||'.')
    from public.practitioners p where p.id = s.practitioner_id and p.user_id is not null;
  perform public.write_audit('appointment.booked','appointment',new_id::text, jsonb_build_object('slot',_slot_id));
  return new_id;
end $$;

create or replace function public.cancel_appointment(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a record; is_owner boolean;
begin
  select * into a from public.appointments where id = _id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  is_owner := a.patient_id = auth.uid();
  if not (is_owner or public.is_staff() or public.is_admin() or (a.practitioner_id = public.current_practitioner_id() and public.is_aal2())) then raise exception 'FORBIDDEN'; end if;
  if a.status not in ('scheduled','confirmed') then raise exception 'NOT_CANCELLABLE'; end if;
  if is_owner and a.starts_at < now() + interval '24 hours' then raise exception 'TOO_LATE'; end if;
  update public.appointments set status='cancelled', cancelled_at=now(), cancelled_by=auth.uid(), updated_at=now() where id=_id;
  update public.availability_slots set is_booked=false where id=a.slot_id;
  perform public.notify(p.user_id,'cancellation','Rendez-vous annulé','Le rendez-vous du '||to_char(a.starts_at at time zone 'Africa/Tunis','DD/MM/YYYY à HH24:MI')||' a été annulé.')
    from public.practitioners p where p.id=a.practitioner_id and p.user_id is not null;
  if not is_owner then
    perform public.notify(a.patient_id,'cancellation','Rendez-vous annulé','Votre rendez-vous du '||to_char(a.starts_at at time zone 'Africa/Tunis','DD/MM/YYYY à HH24:MI')||' a été annulé par la clinique.');
  end if;
  perform public.write_audit('appointment.cancelled','appointment',_id::text,null,'warning');
end $$;

create or replace function public.reschedule_appointment(_id uuid, _new_slot uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare a record; new_id uuid;
begin
  select * into a from public.appointments where id=_id;
  if not found or a.patient_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;
  perform public.cancel_appointment(_id);
  new_id := public.book_appointment(_new_slot, a.reason);
  perform public.write_audit('appointment.rescheduled','appointment',new_id::text, jsonb_build_object('from',_id));
  return new_id;
end $$;

create or replace function public.complete_appointment(_id uuid, _status public.appointment_status)
returns void language plpgsql security definer set search_path = public as $$
begin
  if _status not in ('completed','no_show','confirmed') then raise exception 'INVALID'; end if;
  update public.appointments set status=_status, updated_at=now()
   where id=_id and practitioner_id=public.current_practitioner_id() and public.is_aal2();
  if not found then raise exception 'FORBIDDEN'; end if;
  perform public.write_audit('appointment.'||_status,'appointment',_id::text,null);
end $$;

create or replace function public.validate_report(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.consultation_reports where id=_id;
  if not found or r.practitioner_id <> public.current_practitioner_id() or not public.is_aal2() then raise exception 'FORBIDDEN'; end if;
  if r.status <> 'draft' then raise exception 'ALREADY_VALIDATED'; end if;
  if length(trim(r.diagnosis)) = 0 then raise exception 'DIAGNOSIS_REQUIRED'; end if;
  update public.consultation_reports set status='validated', validated_at=now(), updated_at=now() where id=_id;
  perform public.notify(r.patient_id,'report','Compte rendu disponible','Un nouveau compte rendu de consultation est disponible.');
  perform public.write_audit('report.validated','consultation_report',_id::text,null);
end $$;

create or replace function public.validate_result(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.medical_results where id=_id;
  if not found or r.practitioner_id <> public.current_practitioner_id() or not public.is_aal2() then raise exception 'FORBIDDEN'; end if;
  update public.medical_results set status='validated' where id=_id;
  perform public.notify(r.patient_id,'result','Nouveau résultat disponible','Le résultat « '||r.title||' » est disponible.');
  perform public.write_audit('result.validated','medical_result',_id::text,null);
end $$;

-- admin user management
create or replace function public.admin_set_role(_user uuid, _role public.app_role, _grant boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if _user = auth.uid() and _role='admin' and not _grant then raise exception 'SELF_DEMOTION'; end if;
  if _grant then insert into public.user_roles(user_id,role) values (_user,_role) on conflict do nothing;
  else delete from public.user_roles where user_id=_user and role=_role; end if;
  perform public.write_audit(case when _grant then 'role.granted' else 'role.revoked' end,'user',_user::text, jsonb_build_object('role',_role),'warning');
end $$;

create or replace function public.admin_set_active(_user uuid, _active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if _user = auth.uid() then raise exception 'SELF_DEACTIVATION'; end if;
  update public.profiles set is_active=_active, updated_at=now() where id=_user;
  perform public.write_audit(case when _active then 'user.activated' else 'user.deactivated' end,'user',_user::text,null,'warning');
end $$;

-- anonymized stats
create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_admin() or public.is_staff()) then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'patients', (select count(*) from public.user_roles where role='patient'),
    'practitioners', (select count(*) from public.practitioners where is_active),
    'upcoming', (select count(*) from public.appointments where status in ('scheduled','confirmed') and starts_at > now()),
    'cancelled_30d', (select count(*) from public.appointments where status='cancelled' and cancelled_at > now()-interval '30 days'),
    'by_clinic', (select coalesce(jsonb_agg(x),'[]') from (select c.city, count(a.id) as total from public.clinics c left join public.appointments a on a.clinic_id=c.id and a.starts_at > now()-interval '30 days' group by c.city order by c.city) x),
    'by_status', (select coalesce(jsonb_agg(x),'[]') from (select status, count(*) as total from public.appointments group by status) x),
    'failed_logins_24h', (select count(*) from public.login_attempts where not success and created_at > now()-interval '24 hours')
  );
end $$;

revoke execute on function public.book_appointment(uuid,text), public.cancel_appointment(uuid), public.reschedule_appointment(uuid,uuid),
  public.complete_appointment(uuid,public.appointment_status), public.validate_report(uuid), public.validate_result(uuid),
  public.admin_set_role(uuid,public.app_role,boolean), public.admin_set_active(uuid,boolean), public.admin_stats() from public, anon;
grant execute on function public.book_appointment(uuid,text), public.cancel_appointment(uuid), public.reschedule_appointment(uuid,uuid),
  public.complete_appointment(uuid,public.appointment_status), public.validate_report(uuid), public.validate_result(uuid),
  public.admin_set_role(uuid,public.app_role,boolean), public.admin_set_active(uuid,boolean), public.admin_stats() to authenticated;

-- audit triggers for medical data access changes
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs(user_id,user_email,action,entity,entity_id)
  values (auth.uid(), (select email from public.profiles where id=auth.uid()), lower(tg_op)||'.'||tg_table_name, tg_table_name, coalesce(new.id, old.id)::text);
  return coalesce(new, old);
end $$;
create trigger audit_reports after insert or update on public.consultation_reports for each row execute function public.audit_row_change();
create trigger audit_results after insert on public.medical_results for each row execute function public.audit_row_change();
create trigger audit_records after update on public.medical_records for each row execute function public.audit_row_change();

-- ========== HARDENING ==========
revoke execute on function public.has_role(uuid,public.app_role), public.current_practitioner_id(), public.is_admin(), public.is_staff(), public.is_my_patient(uuid) from public, anon;
grant execute on function public.has_role(uuid,public.app_role), public.current_practitioner_id(), public.is_admin(), public.is_staff(), public.is_my_patient(uuid) to authenticated;
revoke execute on function public.handle_new_user(), public.audit_row_change() from public, anon, authenticated;
create policy "no direct access" on public.login_attempts for select to authenticated using (false);

-- ========== AI APPOINTMENT REQUESTS ==========
create table public.appointment_requests (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null default auth.uid(),
  raw_notes text not null check (char_length(raw_notes) between 10 and 4000),
  summary text not null,
  urgency text not null check (urgency in ('low','medium','high','urgent')),
  suggested_specialty text,
  symptoms text[] not null default '{}',
  duration text,
  preferred_timing text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  staff_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.appointment_requests (patient_id, created_at desc);
create index on public.appointment_requests (status, created_at desc);
grant select, insert, update on public.appointment_requests to authenticated;
grant all on public.appointment_requests to service_role;
alter table public.appointment_requests enable row level security;

create policy "patient reads own requests" on public.appointment_requests for select to authenticated
  using (patient_id = auth.uid());
create policy "patient creates own requests" on public.appointment_requests for insert to authenticated
  with check (patient_id = auth.uid() and public.has_role(auth.uid(),'patient') and status = 'pending' and reviewed_by is null);
create policy "staff reads requests" on public.appointment_requests for select to authenticated
  using (public.is_staff() or public.is_admin());
create policy "staff reviews requests" on public.appointment_requests for update to authenticated
  using (public.is_staff() or public.is_admin()) with check (public.is_staff() or public.is_admin());
