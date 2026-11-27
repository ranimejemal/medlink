alter table public.wazuh_alerts
add column if not exists is_test boolean not null default false;
