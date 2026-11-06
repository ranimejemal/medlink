-- US-04: keep proof of the patient's consent (date set by the server, version of the policy).
-- US-15: notification preferences, editable by the patient; e-mail kept in sync with Auth.

alter table public.profiles
  add column consent_at timestamptz,
  add column consent_version text,
  add column notify_email boolean not null default true,
  add column notify_sms boolean not null default false;

-- Patients may edit their contact details and preferences, never their consent or status.
grant update (notify_email, notify_sms) on public.profiles to authenticated;

-- Same as the baseline, plus the consent recorded at sign-up (server time, not the browser's).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare inv record;
begin
  insert into public.profiles(id,email,first_name,last_name,phone,consent_at,consent_version)
  values (new.id, new.email,
    coalesce(new.raw_user_meta_data->>'first_name',''),
    coalesce(new.raw_user_meta_data->>'last_name',''),
    new.raw_user_meta_data->>'phone',
    case when new.raw_user_meta_data->>'consent' = 'true' then now() end,
    case when new.raw_user_meta_data->>'consent' = 'true'
      then left(coalesce(new.raw_user_meta_data->>'consent_version', ''), 32) end);
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

-- A confirmed e-mail change in Auth is copied to the profile.
create or replace function public.sync_profile_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email, updated_at = now() where id = new.id;
  insert into public.audit_logs(user_id,user_email,action,entity,entity_id)
  values (new.id, new.email, 'profile.email_changed', 'user', new.id::text);
  return new;
end $$;
revoke execute on function public.sync_profile_email() from public, anon, authenticated;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.sync_profile_email();