CREATE OR REPLACE FUNCTION public.admin_delete_user(_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare em text;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if _user = auth.uid() then raise exception 'SELF_DELETION'; end if;
  select email into em from public.profiles where id = _user;
  if not found then raise exception 'NOT_FOUND'; end if;
  if public.has_role(_user,'admin') and (select count(*) from public.user_roles where role='admin') <= 1 then
    raise exception 'LAST_ADMIN';
  end if;
  if exists (select 1 from public.appointments where patient_id = _user)
     or exists (select 1 from public.medical_results where patient_id = _user)
     or exists (select 1 from public.consultation_reports where patient_id = _user) then
    raise exception 'HAS_CLINICAL_DATA';
  end if;

  perform public.write_audit('user.deleted','user',_user::text, jsonb_build_object('email',em),'warning');

  update public.practitioners set user_id = null where user_id = _user;
  delete from public.appointment_requests where patient_id = _user;
  delete from public.notifications where user_id = _user;
  delete from public.medical_records where patient_id = _user;
  delete from public.user_roles where user_id = _user;
  delete from public.profiles where id = _user;
  delete from auth.users where id = _user;
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_invite_user(_email text, _role app_role, _practitioner uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare new_id uuid; e text := lower(trim(_email));
begin
  if not (public.is_admin() or (public.is_staff() and _role in ('practitioner','staff'))) then raise exception 'FORBIDDEN'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'INVALID_EMAIL'; end if;
  if exists (select 1 from public.profiles where lower(email) = e) then raise exception 'duplicate key'; end if;
  insert into public.account_invitations(email, role, practitioner_id, created_by)
  values (e, _role, _practitioner, auth.uid()) returning id into new_id;
  perform public.write_audit('invitation.created','user',new_id::text, jsonb_build_object('role',_role,'email',e),'warning');
  return new_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_list_users()
 RETURNS TABLE(id uuid, email text, first_name text, last_name text, phone text, is_active boolean, created_at timestamp with time zone, last_sign_in_at timestamp with time zone, last_session_at timestamp with time zone, roles app_role[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return query
    select p.id, p.email, p.first_name, p.last_name, p.phone, p.is_active,
           coalesce(u.created_at, p.created_at), u.last_sign_in_at,
           (select max(s.updated_at) from auth.sessions s where s.user_id = p.id),
           coalesce((select array_agg(r.role order by r.role) from public.user_roles r where r.user_id = p.id), '{}')
    from public.profiles p left join auth.users u on u.id = p.id
    order by coalesce(u.created_at, p.created_at) desc;
end $function$
;

CREATE OR REPLACE FUNCTION public.staff_list_users()
 RETURNS TABLE(id uuid, email text, first_name text, last_name text, is_active boolean, created_at timestamp with time zone, roles app_role[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (public.is_staff() or public.is_admin()) then raise exception 'FORBIDDEN'; end if;
  return query
    select p.id, p.email, p.first_name, p.last_name, p.is_active, p.created_at,
           array(select r.role from public.user_roles r where r.user_id = p.id order by r.role)
    from public.profiles p
    where exists (select 1 from public.user_roles r where r.user_id = p.id and r.role in ('practitioner','staff'))
    order by p.created_at desc;
end $function$
;