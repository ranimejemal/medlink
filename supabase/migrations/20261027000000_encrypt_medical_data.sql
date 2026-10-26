-- US-43: AES-256 encryption at rest for medical data.
-- Sensitive text is stored only as pgcrypto ciphertext (*_enc columns). The key is generated
-- here and kept in Supabase Vault, never in the repository or the application.
-- Write: insert/update the plain columns as before; a trigger encrypts them and empties the plain column.
-- Read: select from the *_decrypted views (security_invoker, so the table's RLS still applies).

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'medical_data_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'medical_data_key',
      'US-43: AES-256 key for medical data');
  end if;
end $$;

create or replace function private.medical_key()
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'medical_data_key'
$$;

create or replace function private.encrypt_text(_v text)
returns bytea language sql volatile security definer set search_path = '' as $$
  select case when _v is null then null
    else extensions.pgp_sym_encrypt(_v, private.medical_key(), 'cipher-algo=aes256') end
$$;

create or replace function private.decrypt_text(_v bytea)
returns text language sql stable security definer set search_path = '' as $$
  select case when _v is null then null else extensions.pgp_sym_decrypt(_v, private.medical_key()) end
$$;

revoke all on function private.medical_key(), private.encrypt_text(text), private.decrypt_text(bytea)
  from public, anon, authenticated;
-- Only decryption is exposed, and only through the views below (the private schema is not in the API).
grant execute on function private.decrypt_text(bytea) to authenticated;

-- ========== medical_records ==========
alter table public.medical_records
  add column blood_type_enc bytea,
  add column allergies_enc bytea,
  add column chronic_conditions_enc bytea,
  add column current_treatments_enc bytea;

create or replace function private.encrypt_medical_records()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.blood_type is not null then
    new.blood_type_enc := private.encrypt_text(new.blood_type); new.blood_type := null;
  end if;
  if new.allergies is not null then
    new.allergies_enc := private.encrypt_text(new.allergies); new.allergies := null;
  end if;
  if new.chronic_conditions is not null then
    new.chronic_conditions_enc := private.encrypt_text(new.chronic_conditions); new.chronic_conditions := null;
  end if;
  if new.current_treatments is not null then
    new.current_treatments_enc := private.encrypt_text(new.current_treatments); new.current_treatments := null;
  end if;
  return new;
end $$;
create trigger encrypt_medical_records before insert or update on public.medical_records
  for each row execute function private.encrypt_medical_records();

create view public.medical_records_decrypted with (security_invoker = true) as
  select id, patient_id, updated_at,
    private.decrypt_text(blood_type_enc) as blood_type,
    private.decrypt_text(allergies_enc) as allergies,
    private.decrypt_text(chronic_conditions_enc) as chronic_conditions,
    private.decrypt_text(current_treatments_enc) as current_treatments
  from public.medical_records;

-- ========== consultation_reports ==========
alter table public.consultation_reports
  alter column reason drop not null,
  alter column observations drop not null,
  alter column diagnosis drop not null,
  alter column prescription drop not null,
  alter column recommendations drop not null,
  add column reason_enc bytea,
  add column observations_enc bytea,
  add column diagnosis_enc bytea,
  add column prescription_enc bytea,
  add column recommendations_enc bytea;

create or replace function private.encrypt_consultation_reports()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.reason is not null then
    new.reason_enc := private.encrypt_text(new.reason); new.reason := null;
  end if;
  if new.observations is not null then
    new.observations_enc := private.encrypt_text(new.observations); new.observations := null;
  end if;
  if new.diagnosis is not null then
    new.diagnosis_enc := private.encrypt_text(new.diagnosis); new.diagnosis := null;
  end if;
  if new.prescription is not null then
    new.prescription_enc := private.encrypt_text(new.prescription); new.prescription := null;
  end if;
  if new.recommendations is not null then
    new.recommendations_enc := private.encrypt_text(new.recommendations); new.recommendations := null;
  end if;
  return new;
end $$;
create trigger encrypt_consultation_reports before insert or update on public.consultation_reports
  for each row execute function private.encrypt_consultation_reports();

create view public.consultation_reports_decrypted with (security_invoker = true) as
  select id, appointment_id, patient_id, practitioner_id, status, validated_at, created_at, updated_at,
    private.decrypt_text(reason_enc) as reason,
    private.decrypt_text(observations_enc) as observations,
    private.decrypt_text(diagnosis_enc) as diagnosis,
    private.decrypt_text(prescription_enc) as prescription,
    private.decrypt_text(recommendations_enc) as recommendations
  from public.consultation_reports;

-- the diagnosis is now encrypted, so the validation check reads the decrypted value
create or replace function public.validate_report(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.consultation_reports where id=_id;
  if not found or r.practitioner_id <> public.current_practitioner_id() or not public.is_aal2() then raise exception 'FORBIDDEN'; end if;
  if r.status <> 'draft' then raise exception 'ALREADY_VALIDATED'; end if;
  if length(trim(coalesce(private.decrypt_text(r.diagnosis_enc), ''))) = 0 then raise exception 'DIAGNOSIS_REQUIRED'; end if;
  update public.consultation_reports set status='validated', validated_at=now(), updated_at=now() where id=_id;
  perform public.notify(r.patient_id,'report','Compte rendu disponible','Un nouveau compte rendu de consultation est disponible.');
  perform public.write_audit('report.validated','consultation_report',_id::text,null);
end $$;

-- ========== medical_results ==========
-- title and category stay readable (used in lists and notifications); the content is encrypted.
alter table public.medical_results
  alter column summary drop not null,
  add column summary_enc bytea,
  add column values_json_enc bytea;

create or replace function private.encrypt_medical_results()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.summary is not null then
    new.summary_enc := private.encrypt_text(new.summary); new.summary := null;
  end if;
  if new.values_json is not null then
    new.values_json_enc := private.encrypt_text(new.values_json::text); new.values_json := null;
  end if;
  return new;
end $$;
create trigger encrypt_medical_results before insert or update on public.medical_results
  for each row execute function private.encrypt_medical_results();

create view public.medical_results_decrypted with (security_invoker = true) as
  select id, patient_id, practitioner_id, clinic_id, title, category, status, result_date, created_at,
    private.decrypt_text(summary_enc) as summary,
    private.decrypt_text(values_json_enc)::jsonb as values_json
  from public.medical_results;

revoke all on function private.encrypt_medical_records(), private.encrypt_consultation_reports(),
  private.encrypt_medical_results() from public, anon, authenticated;

revoke all on public.medical_records_decrypted, public.consultation_reports_decrypted,
  public.medical_results_decrypted from public, anon, authenticated;
grant select on public.medical_records_decrypted, public.consultation_reports_decrypted,
  public.medical_results_decrypted to authenticated;

-- encrypt any rows written before this migration (the triggers do the work)
update public.medical_records set blood_type = blood_type, allergies = allergies,
  chronic_conditions = chronic_conditions, current_treatments = current_treatments
  where coalesce(blood_type, allergies, chronic_conditions, current_treatments) is not null;
update public.consultation_reports set reason = reason, observations = observations, diagnosis = diagnosis,
  prescription = prescription, recommendations = recommendations
  where coalesce(reason, observations, diagnosis, prescription, recommendations) is not null;
update public.medical_results set summary = summary, values_json = values_json
  where summary is not null or values_json is not null;