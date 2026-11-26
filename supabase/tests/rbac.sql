-- US-62: automated RBAC tests. Each line checks what one role can or cannot do, through the
-- same rules the API uses (RLS policies, SECURITY DEFINER functions, MFA level).
-- Everything runs in ONE transaction that is rolled back: no data is left behind.
-- NEVER run it on production. Run it on the local Supabase stack (see docs/tests.md):
--   npx supabase start
--   docker exec -i supabase_db_lmocoknimijxqegbxbyg psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/rbac.sql
-- Output: one "PASS" line per check, and "ALL RBAC TESTS PASSED" at the end. A failed check stops
-- the script with "FAIL: ...".

\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null
begin;

-- ---------- test helpers (temporary, dropped at rollback) ----------
create function pg_temp.login(_uid uuid, _aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(_uid::text, ''), true);
  perform set_config('request.jwt.claims',
    case when _uid is null then '{"role":"anon"}'
         else json_build_object('sub', _uid, 'aal', _aal, 'role', 'authenticated')::text end, true);
  execute case when _uid is null then 'set local role anon' else 'set local role authenticated' end;
end $$;

create function pg_temp.expect_rows(_label text, _sql text, _n int) returns void language plpgsql as $$
declare got int;
begin
  execute format('select count(*) from (%s) t', _sql) into got;
  if got <> _n then raise exception 'FAIL: % (expected % row(s), got %)', _label, _n, got; end if;
  raise notice 'PASS  %', _label;
end $$;

create function pg_temp.expect_changes(_label text, _sql text, _n int) returns void language plpgsql as $$
declare got int;
begin
  execute _sql;
  get diagnostics got = row_count;
  if got <> _n then raise exception 'FAIL: % (expected % row(s) changed, got %)', _label, _n, got; end if;
  raise notice 'PASS  %', _label;
end $$;

create function pg_temp.expect_error(_label text, _sql text, _pattern text) returns void language plpgsql as $$
begin
  begin
    execute _sql;
  exception when others then
    if sqlerrm ~* _pattern then raise notice 'PASS  %', _label; return; end if;
    raise exception 'FAIL: % (unexpected error: %)', _label, sqlerrm;
  end;
  raise exception 'FAIL: % (no error, access was allowed)', _label;
end $$;

-- ---------- test data ----------
insert into auth.users (id, email, email_confirmed_at) values
  ('a0000000-0000-4000-8000-00000000000a', 'rbac.patient.a@test.invalid', now()),
  ('b0000000-0000-4000-8000-00000000000b', 'rbac.patient.b@test.invalid', now()),
  ('d0000000-0000-4000-8000-00000000000d', 'rbac.doctor@test.invalid', now()),
  ('e0000000-0000-4000-8000-00000000000e', 'rbac.doctor2@test.invalid', now()),
  ('5a000000-0000-4000-8000-0000000000aa', 'rbac.staff@test.invalid', now()),
  ('ad000000-0000-4000-8000-0000000000ad', 'rbac.admin@test.invalid', now());
delete from public.user_roles where user_id in ('d0000000-0000-4000-8000-00000000000d',
  'e0000000-0000-4000-8000-00000000000e', '5a000000-0000-4000-8000-0000000000aa', 'ad000000-0000-4000-8000-0000000000ad');
insert into public.user_roles (user_id, role) values
  ('d0000000-0000-4000-8000-00000000000d', 'practitioner'), ('e0000000-0000-4000-8000-00000000000e', 'practitioner'),
  ('5a000000-0000-4000-8000-0000000000aa', 'staff'), ('ad000000-0000-4000-8000-0000000000ad', 'admin');
insert into public.specialties (id, name) values ('5e000000-0000-4000-8000-000000000001', 'RBAC test');
insert into public.clinics (id, name, city, address, phone)
  values ('c1000000-0000-4000-8000-000000000001', 'RBAC clinic', 'Tunis', 'test', '70000000');
insert into public.practitioners (id, user_id, first_name, last_name, title, specialty_id) values
  ('91000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-00000000000d', 'Doc', 'One', 'Dr', '5e000000-0000-4000-8000-000000000001'),
  ('92000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-00000000000e', 'Doc', 'Two', 'Dr', '5e000000-0000-4000-8000-000000000001');
insert into public.practitioner_clinics (practitioner_id, clinic_id) values
  ('91000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001'),
  ('92000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001');
-- Note: the sign-up trigger gives every account its own (empty) medical record, so the checks
-- below look at OTHER people's records (patient_id <> auth.uid()).
-- Patient A is a patient of doctor 1 only. Patient B has no appointment.
insert into public.appointments (patient_id, practitioner_id, clinic_id, starts_at, ends_at, status)
  values ('a0000000-0000-4000-8000-00000000000a', '91000000-0000-4000-8000-000000000001',
          'c1000000-0000-4000-8000-000000000001', now() - interval '2 days', now() - interval '2 days' + interval '30 min', 'completed');
-- (the sign-up trigger already created an empty record for each patient)
insert into public.medical_records (patient_id) values
  ('a0000000-0000-4000-8000-00000000000a'), ('b0000000-0000-4000-8000-00000000000b') on conflict (patient_id) do nothing;
update public.medical_records set allergies = 'Pénicilline' where patient_id = 'a0000000-0000-4000-8000-00000000000a';
update public.medical_records set allergies = 'Aucune' where patient_id = 'b0000000-0000-4000-8000-00000000000b';
insert into public.medical_results (patient_id, practitioner_id, title, category, summary, status) values
  ('a0000000-0000-4000-8000-00000000000a', '91000000-0000-4000-8000-000000000001', 'NFS', 'Biologie', 'normal', 'validated'),
  ('a0000000-0000-4000-8000-00000000000a', '91000000-0000-4000-8000-000000000001', 'Glycémie', 'Biologie', 'en cours', 'pending');

-- ---------- 1. anonymous visitor ----------
select pg_temp.login(null);
select pg_temp.expect_error('anon: cannot read profiles', 'select * from public.profiles', 'permission denied');
select pg_temp.expect_error('anon: cannot read appointments', 'select * from public.appointments', 'permission denied');
select pg_temp.expect_error('anon: cannot read medical records', 'select * from public.medical_records', 'permission denied');
select pg_temp.expect_error('anon: cannot export data', 'select public.export_my_data()', 'permission denied');
select pg_temp.expect_error('anon: cannot book', $$select public.book_appointment(gen_random_uuid(), 'x')$$, 'permission denied');
select pg_temp.expect_rows('anon: can list clinics (public directory)', 'select * from public.clinics where name = ''RBAC clinic''', 1);
reset role;

-- ---------- 2. patient A ----------
select pg_temp.login('a0000000-0000-4000-8000-00000000000a');
select pg_temp.expect_rows('patient: sees only own profile', 'select * from public.profiles', 1);
select pg_temp.expect_rows('patient: sees own appointments', 'select * from public.appointments', 1);
select pg_temp.expect_rows('patient: sees own medical record only', 'select * from public.medical_records_decrypted', 1);
select pg_temp.expect_rows('patient: sees validated results only', 'select * from public.medical_results', 1);
select pg_temp.expect_rows('patient: cannot see patient B record',
  $$select * from public.medical_records where patient_id = 'b0000000-0000-4000-8000-00000000000b'$$, 0);
select pg_temp.expect_changes('patient: cannot change another profile (0 rows updated)',
  $$update public.profiles set first_name = 'X' where id = 'b0000000-0000-4000-8000-00000000000b'$$, 0);
select pg_temp.expect_error('patient: cannot give himself a role',
  $$insert into public.user_roles (user_id, role) values ('a0000000-0000-4000-8000-00000000000a', 'admin')$$, 'permission denied|row-level security');
select pg_temp.expect_error('patient: cannot list users', 'select * from public.admin_list_users()', 'FORBIDDEN');
select pg_temp.expect_error('patient: cannot see clinic supervision', 'select public.clinic_supervision(30)', 'FORBIDDEN');
select pg_temp.expect_error('patient: cannot export statistics', $$select public.anonymized_stats('2026-01-01', '2026-12-31')$$, 'FORBIDDEN');
select pg_temp.expect_error('patient: cannot validate a result',
  $$select public.validate_result(id) from public.medical_results limit 1$$, 'FORBIDDEN|NOT_FOUND');
select pg_temp.expect_rows('patient: reads only own audit entries',
  $$select * from public.audit_logs where user_id is distinct from 'a0000000-0000-4000-8000-00000000000a'$$, 0);
select pg_temp.expect_error('patient: cannot delete audit log', 'delete from public.audit_logs', 'permission denied');
select pg_temp.expect_error('patient: cannot write the audit log directly',
  $$select public.write_audit('security.bruteforce', 'x', 'x', null, 'critical', null)$$, 'permission denied');
select pg_temp.expect_error('patient: cannot log an action outside the allow-list',
  $$select public.log_event('user.deleted', 'user', 'x')$$, 'FORBIDDEN');
select pg_temp.expect_error('patient: cannot pretend to export the audit log',
  $$select public.log_event('audit.exported', 'audit_logs')$$, 'FORBIDDEN');
select public.log_event('auth.logout', 'auth');
select pg_temp.expect_rows('patient: logs an allowed event under his own id',
  $$select 1 from public.audit_logs where action = 'auth.logout' and user_id = auth.uid() and severity = 'info'$$, 1);
select pg_temp.expect_changes('patient: cannot change opening hours (0 rows updated)',
  'update public.portal_hours set enabled = not enabled', 0);
reset role;

-- ---------- 3. practitioner WITHOUT MFA (aal1) ----------
select pg_temp.login('d0000000-0000-4000-8000-00000000000d', 'aal1');
select pg_temp.expect_rows('doctor without MFA: no medical record', 'select * from public.medical_records where patient_id <> auth.uid()', 0);
select pg_temp.expect_rows('doctor without MFA: no appointments', 'select * from public.appointments', 0);
reset role;

-- ---------- 4. practitioner WITH MFA (aal2) ----------
select pg_temp.login('d0000000-0000-4000-8000-00000000000d', 'aal2');
select pg_temp.expect_rows('doctor: reads record of own patient A', 'select * from public.medical_records_decrypted where patient_id <> auth.uid()', 1);
select pg_temp.expect_rows('doctor: decrypts it', $$select * from public.medical_records_decrypted where allergies = 'Pénicilline'$$, 1);
select pg_temp.expect_rows('doctor: cannot read patient B (not his patient)',
  $$select * from public.medical_records where patient_id = 'b0000000-0000-4000-8000-00000000000b'$$, 0);
select pg_temp.expect_rows('doctor: sees pending results of own patient', 'select * from public.medical_results', 2);
select pg_temp.expect_error('doctor: cannot list users', 'select * from public.admin_list_users()', 'FORBIDDEN');
select pg_temp.expect_error('doctor: cannot read direction summary', 'select public.direction_summary(30)', 'FORBIDDEN');
reset role;

-- ---------- 5. another practitioner (aal2) ----------
select pg_temp.login('e0000000-0000-4000-8000-00000000000e', 'aal2');
select pg_temp.expect_rows('doctor 2: cannot read records of doctor 1''s patient', 'select * from public.medical_records where patient_id <> auth.uid()', 0);
select pg_temp.expect_rows('doctor 2: cannot read results of doctor 1''s patient', 'select * from public.medical_results', 0);
select pg_temp.expect_rows('doctor 2: no appointments of doctor 1', 'select * from public.appointments', 0);
reset role;

-- ---------- 6. reception staff ----------
select pg_temp.login('5a000000-0000-4000-8000-0000000000aa');
select pg_temp.expect_rows('staff: sees appointments (to manage the agenda)',
  $$select * from public.appointments where clinic_id = 'c1000000-0000-4000-8000-000000000001'$$, 1);
select pg_temp.expect_rows('staff: NO medical record', 'select * from public.medical_records where patient_id <> auth.uid()', 0);
select pg_temp.expect_rows('staff: NO medical result', 'select * from public.medical_results', 0);
select pg_temp.expect_rows('staff: searches patients by name', $$select * from public.staff_search_patients('rbac.patient')$$, 2);
select pg_temp.expect_error('staff: cannot read direction summary', 'select public.direction_summary(30)', 'FORBIDDEN');
select pg_temp.expect_error('staff: cannot give a role',
  $$select public.admin_set_role(_user => 'a0000000-0000-4000-8000-00000000000a', _role => 'admin', _grant => true)$$, 'FORBIDDEN');
reset role;

-- ---------- 7. administrator without MFA ----------
select pg_temp.login('ad000000-0000-4000-8000-0000000000ad', 'aal1');
select pg_temp.expect_error('admin without MFA: cannot list users', 'select * from public.admin_list_users()', 'FORBIDDEN');
select pg_temp.expect_rows('admin without MFA: reads only own audit entries',
  $$select * from public.audit_logs where user_id is distinct from 'ad000000-0000-4000-8000-0000000000ad'$$, 0);
reset role;

-- ---------- 8. administrator with MFA ----------
select pg_temp.login('ad000000-0000-4000-8000-0000000000ad', 'aal2');
select pg_temp.expect_rows('admin: lists users', $$select * from public.admin_list_users() where email like 'rbac.%'$$, 6);
select pg_temp.expect_rows('admin: reads the whole audit log', 'select 1 from public.audit_logs limit 1', 1);
select pg_temp.expect_rows('admin: NO medical record (not a practitioner)', 'select * from public.medical_records where patient_id <> auth.uid()', 0);
select pg_temp.expect_error('admin: cannot alter audit log', 'delete from public.audit_logs', 'permission denied|AUDIT_LOG_IMMUTABLE');
select pg_temp.expect_rows('admin: supervision works', 'select public.clinic_supervision(30)', 1);
reset role;

\echo 'ALL RBAC TESTS PASSED'
rollback;
