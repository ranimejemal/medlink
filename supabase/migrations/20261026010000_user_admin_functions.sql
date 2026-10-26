select string_agg(pg_get_functiondef(p.oid) || ';', E'\n\n') as sql
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('admin_invite_user','admin_list_users','admin_delete_user','staff_list_users');