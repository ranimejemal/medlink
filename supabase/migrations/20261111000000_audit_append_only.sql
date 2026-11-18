-- US-47 / OWASP A09 : journal d'audit en écriture seule.
-- Teste en transaction annulée sur le projet medlink (UPDATE et DELETE bloqués, rien d'autre ne casse).
-- A appliquer APRES la migration 20261108000000_reports_results_staff_booking.sql.

create or replace function public.audit_logs_readonly()
returns trigger language plpgsql as $$
begin
  raise exception 'AUDIT_LOG_IMMUTABLE';
end $$;

drop trigger if exists audit_logs_no_change on public.audit_logs;
create trigger audit_logs_no_change before update or delete on public.audit_logs
  for each row execute function public.audit_logs_readonly();

revoke insert, update, delete, truncate on public.audit_logs from anon, authenticated;
