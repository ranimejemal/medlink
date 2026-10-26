-- Same rule as the baseline: RPCs are callable by signed-in users only, never anon.
revoke execute on function public.admin_delete_user(uuid), public.admin_invite_user(text, public.app_role, uuid),
  public.admin_list_users(), public.staff_list_users() from public, anon;
grant execute on function public.admin_delete_user(uuid), public.admin_invite_user(text, public.app_role, uuid),
  public.admin_list_users(), public.staff_list_users() to authenticated;

-- An invitation may only link a practitioner record that has no account yet;
-- otherwise registering with the invited e-mail would take over that doctor's account.
create or replace function public.admin_invite_user(_email text, _role public.app_role, _practitioner uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid; e text := lower(trim(_email));
begin
  if not (public.is_admin() or (public.is_staff() and _role in ('practitioner','staff'))) then raise exception 'FORBIDDEN'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'INVALID_EMAIL'; end if;
  if exists (select 1 from public.profiles where lower(email) = e) then raise exception 'duplicate key'; end if;
  if _practitioner is not null then
    if _role <> 'practitioner' then raise exception 'FORBIDDEN'; end if;
    if not exists (select 1 from public.practitioners where id = _practitioner and user_id is null)
       or exists (select 1 from public.account_invitations where practitioner_id = _practitioner) then
      raise exception 'PRACTITIONER_ALREADY_LINKED';
    end if;
  end if;
  insert into public.account_invitations(email, role, practitioner_id, created_by)
  values (e, _role, _practitioner, auth.uid()) returning id into new_id;
  perform public.write_audit('invitation.created','user',new_id::text, jsonb_build_object('role',_role,'email',e),'warning');
  return new_id;
end $$;