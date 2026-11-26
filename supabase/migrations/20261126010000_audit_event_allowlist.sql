-- US-47 / OWASP A09 (open point of docs/OWASP_CHECKLIST.md): until now any signed-in user could call
-- write_audit() through the API and write fake lines in the audit log.
-- From now on:
--   * write_audit() is no longer callable through the API (only by the server's service role and by
--     the database's own SECURITY DEFINER functions, which run as their owner);
--   * the app writes its events with log_event(), which accepts only a fixed list of actions,
--     always records the real caller (auth.uid()) and decides the severity itself.

create or replace function public.log_event(
  _action text, _entity text default null, _entity_id text default null,
  _details jsonb default null, _ip text default null)
returns void language plpgsql security definer set search_path = public as $$
declare sev text;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN'; end if;
  sev := case _action
    when 'auth.logout' then 'info'
    when 'auth.session_expired' then 'info'
    when 'mfa.enrolled' then 'info'
    when 'mfa.verified' then 'info'
    when 'mfa.failed' then 'warning'
    when 'password.changed' then 'info'
    when 'access.denied' then 'warning'
    when 'record.viewed' then 'info'
    when 'document.downloaded' then 'info'
    when 'document.denied' then 'warning'
    when 'audit.exported' then 'warning'
  end;
  if sev is null then raise exception 'FORBIDDEN'; end if;
  -- Only an administrator (with MFA) can have exported the audit log.
  if _action = 'audit.exported' and not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if length(coalesce(_entity, '')) > 64 or length(coalesce(_entity_id, '')) > 64
     or length(coalesce(_ip, '')) > 64 or length(coalesce(_details::text, '')) > 2000 then
    raise exception 'INVALID';
  end if;
  perform public.write_audit(_action, _entity, nullif(_entity_id, ''), _details, sev, nullif(_ip, ''));
end $$;
revoke execute on function public.log_event(text, text, text, jsonb, text) from public, anon;
grant execute on function public.log_event(text, text, text, jsonb, text) to authenticated;

revoke execute on function public.write_audit(text, text, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.write_audit(text, text, text, jsonb, text, text) to service_role;
