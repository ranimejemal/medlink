-- Release 3 (Ibtihel's branch): patient documents upload, clinic supervision (US-31),
-- management summary and call tracking (US-50 / US-51), anonymized statistics (US-32 / US-46).
-- These objects were first created by hand in the Supabase dashboard. This migration records
-- them in the repository (so a rebuilt database gets them too) and fixes what the review found:
--   * a practitioner could read ALL of a patient's documents, even those not shared with him;
--   * the "shared documents" rules compared a practitioner record id with a user id (never true);
--   * TRUNCATE / TRIGGER / REFERENCES were granted to anon and authenticated on every table.
-- Safe to re-run.

-- ========== patient_documents ==========
create table if not exists public.patient_documents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  category text not null default 'autre'
    check (category in ('ordonnance', 'analyse', 'imagerie', 'compte_rendu', 'autre')),
  storage_path text not null unique,
  mime_type text not null
    check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now(),
  shared_with_doctor boolean not null default false,
  constraint patient_documents_path_owner check (storage_path like patient_id::text || '/%')
);
create index if not exists patient_documents_patient_idx
  on public.patient_documents (patient_id, created_at desc);

alter table public.patient_documents enable row level security;
revoke all on public.patient_documents from anon, authenticated;
grant select, insert, delete on public.patient_documents to authenticated;
grant all on public.patient_documents to service_role;

drop policy if exists "doctor reads shared documents" on public.patient_documents;
drop policy if exists "practitioner reads patient documents" on public.patient_documents;
drop policy if exists "practitioner reads shared documents" on public.patient_documents;
drop policy if exists "patient reads own documents" on public.patient_documents;
drop policy if exists "patient adds own documents" on public.patient_documents;
drop policy if exists "patient deletes own documents" on public.patient_documents;

create policy "patient reads own documents" on public.patient_documents for select to authenticated
  using (patient_id = auth.uid());
create policy "patient adds own documents" on public.patient_documents for insert to authenticated
  with check (
    patient_id = auth.uid() and public.has_role(auth.uid(), 'patient')
    and (select count(*) from public.patient_documents d where d.patient_id = auth.uid()) < 50
  );
create policy "patient deletes own documents" on public.patient_documents for delete to authenticated
  using (patient_id = auth.uid());
-- Only the documents the patient chose to share, and only for a practitioner who sees him.
create policy "practitioner reads shared documents" on public.patient_documents for select to authenticated
  using (shared_with_doctor and public.is_my_patient(patient_id));

-- ========== storage bucket (private) ==========
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('patient-documents', 'patient-documents', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "doctor reads shared files" on storage.objects;
drop policy if exists "practitioner reads patient files" on storage.objects;
drop policy if exists "practitioner reads shared files" on storage.objects;
drop policy if exists "patient reads own files" on storage.objects;
drop policy if exists "patient uploads own files" on storage.objects;
drop policy if exists "patient deletes own files" on storage.objects;

create policy "patient reads own files" on storage.objects for select to authenticated
  using (bucket_id = 'patient-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "patient uploads own files" on storage.objects for insert to authenticated
  with check (bucket_id = 'patient-documents' and (storage.foldername(name))[1] = auth.uid()::text
              and public.has_role(auth.uid(), 'patient'));
create policy "patient deletes own files" on storage.objects for delete to authenticated
  using (bucket_id = 'patient-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "practitioner reads shared files" on storage.objects for select to authenticated
  using (bucket_id = 'patient-documents' and exists (
    select 1 from public.patient_documents d
     where d.storage_path = storage.objects.name
       and d.shared_with_doctor and public.is_my_patient(d.patient_id)));

-- ========== US-32 / US-46: anonymized statistics (groups under 5 are merged) ==========
CREATE OR REPLACE FUNCTION public.anonymized_stats(_from date, _to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare k constant int := 5; result jsonb;
begin
  if not (public.is_admin() or public.is_staff()) then raise exception 'FORBIDDEN'; end if;
  if _from is null or _to is null or _to < _from or _to - _from > 366 then raise exception 'INVALID_PERIOD'; end if;

  with base as (
    select to_char(date_trunc('month', a.starts_at at time zone 'Africa/Tunis'), 'YYYY-MM') as month,
           c.city, coalesce(s.name, 'Non précisée') as specialty, a.status
    from public.appointments a
    join public.clinics c on c.id = a.clinic_id
    left join public.practitioners p on p.id = a.practitioner_id
    left join public.specialties s on s.id = p.specialty_id
    where (a.starts_at at time zone 'Africa/Tunis')::date between _from and _to
  ), cells as (
    select month, city, specialty, count(*) as total,
           count(*) filter (where status = 'completed') as completed,
           count(*) filter (where status = 'cancelled') as cancelled,
           count(*) filter (where status = 'no_show') as no_show
    from base group by month, city, specialty
  ), kept as (
    select * from cells where total >= k
  ), rest as (
    select month, 'Autres (regroupé)'::text as city, 'Autres (regroupé)'::text as specialty,
           sum(total) as total, sum(completed) as completed, sum(cancelled) as cancelled, sum(no_show) as no_show
    from cells where total < k group by month having sum(total) >= k
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'month', u.month, 'city', u.city, 'specialty', u.specialty, 'appointments', u.total,
           'completed', u.completed, 'cancelled', u.cancelled, 'no_show', u.no_show)
         order by u.month, u.city, u.specialty), '[]'::jsonb)
  into result
  from (select * from kept union all select * from rest) u;

  -- chaque export est tracé dans le journal d'audit
  perform public.write_audit('stats.exported', 'statistics', null,
                             jsonb_build_object('from', _from, 'to', _to, 'k', k));
  return jsonb_build_object('k', k, 'rows', result);
end $function$;

-- ========== US-31: supervision of the clinics ==========
CREATE OR REPLACE FUNCTION public.clinic_supervision(_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (public.is_admin() or public.is_staff()) then raise exception 'FORBIDDEN'; end if;
  if _days is null or _days < 1 or _days > 365 then raise exception 'INVALID_PERIOD'; end if;
  return coalesce((
    select jsonb_agg(x order by x->>'city')
    from (
      select jsonb_build_object(
        'clinic_id', c.id, 'name', c.name, 'city', c.city,
        'practitioners', (select count(distinct pc.practitioner_id) from public.practitioner_clinics pc
                          join public.practitioners p on p.id = pc.practitioner_id
                          where pc.clinic_id = c.id and p.is_active),
        'total', count(a.id),
        'completed', count(a.id) filter (where a.status = 'completed'),
        'cancelled', count(a.id) filter (where a.status = 'cancelled'),
        'no_show', count(a.id) filter (where a.status = 'no_show'),
        'upcoming', (select count(*) from public.appointments u
                     where u.clinic_id = c.id and u.starts_at >= now() and u.status in ('scheduled','confirmed')),
        'slots_14d', (select count(*) from public.availability_slots s
                      where s.clinic_id = c.id and s.starts_at >= now() and s.starts_at < now() + interval '14 days'),
        'booked_14d', (select count(*) from public.availability_slots s
                       where s.clinic_id = c.id and s.is_booked and s.starts_at >= now() and s.starts_at < now() + interval '14 days')
      ) as x
      from public.clinics c
      left join public.appointments a on a.clinic_id = c.id
        and a.starts_at >= now() - make_interval(days => _days) and a.starts_at < now()
      where c.is_active
      group by c.id, c.name, c.city
    ) t
  ), '[]'::jsonb);
end $function$;

-- ========== US-50 / US-51: management summary, online vs reception bookings ==========
CREATE OR REPLACE FUNCTION public.direction_summary(_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare cur_from timestamptz; prev_from timestamptz;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if _days is null or _days < 7 or _days > 365 then raise exception 'INVALID_PERIOD'; end if;
  cur_from := now() - make_interval(days => _days);
  prev_from := cur_from - make_interval(days => _days);
  return jsonb_build_object(
    'period_days', _days,
    'current', (select jsonb_build_object(
        'booked', count(*),
        'online', count(*) filter (where booked_by_staff is null),
        'by_staff', count(*) filter (where booked_by_staff is not null),
        'cancelled', count(*) filter (where status = 'cancelled'),
        'no_show', count(*) filter (where status = 'no_show'),
        'completed', count(*) filter (where status = 'completed'))
      from public.appointments where created_at >= cur_from),
    'previous', (select jsonb_build_object(
        'booked', count(*),
        'online', count(*) filter (where booked_by_staff is null),
        'by_staff', count(*) filter (where booked_by_staff is not null),
        'cancelled', count(*) filter (where status = 'cancelled'),
        'no_show', count(*) filter (where status = 'no_show'),
        'completed', count(*) filter (where status = 'completed'))
      from public.appointments where created_at >= prev_from and created_at < cur_from),
    'new_patients', jsonb_build_object(
      'current', (select count(*) from public.user_roles r join public.profiles p on p.id = r.user_id
                  where r.role = 'patient' and p.created_at >= cur_from),
      'previous', (select count(*) from public.user_roles r join public.profiles p on p.id = r.user_id
                   where r.role = 'patient' and p.created_at >= prev_from and p.created_at < cur_from)),
    'weekly', (select coalesce(jsonb_agg(w order by w->>'week'), '[]'::jsonb) from (
        select jsonb_build_object(
          'week', to_char(date_trunc('week', created_at), 'YYYY-MM-DD'),
          'online', count(*) filter (where booked_by_staff is null),
          'by_staff', count(*) filter (where booked_by_staff is not null)) as w
        from public.appointments
        where created_at >= now() - interval '12 weeks'
        group by date_trunc('week', created_at)) s)
  );
end $function$;

revoke execute on function public.anonymized_stats(date, date), public.clinic_supervision(integer),
  public.direction_summary(integer) from public, anon;
grant execute on function public.anonymized_stats(date, date), public.clinic_supervision(integer),
  public.direction_summary(integer) to authenticated;

-- ========== Hardening (US-61): API roles never need TRUNCATE / TRIGGER / REFERENCES ==========
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', t.tablename);
  end loop;
end $$;
alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;
