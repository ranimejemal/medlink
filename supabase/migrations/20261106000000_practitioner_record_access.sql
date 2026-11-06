-- US-23 / US-47: every opening of a patient record by a practitioner is written to the audit log,
-- and so is every refused attempt (US-39). Returns false instead of raising, so the refusal
-- stays in the log (an exception would roll the audit row back).
create or replace function public.log_record_access(_patient uuid, _ip text default null)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  if not public.is_my_patient(_patient) then
    perform public.write_audit('record.denied', 'patient', _patient::text, null, 'warning', _ip);
    return false;
  end if;
  perform public.write_audit('record.viewed', 'patient', _patient::text, null, 'info', _ip);
  return true;
end $$;
revoke execute on function public.log_record_access(uuid, text) from public, anon;
grant execute on function public.log_record_access(uuid, text) to authenticated;