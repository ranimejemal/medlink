create table if not exists public.wazuh_alerts (
  id uuid primary key default gen_random_uuid(),
  wazuh_alert_id text not null unique,
  rule_id text not null,
  rule_level integer not null,
  description text not null,
  event_type text,
  ip_address text,
  attempts integer,
  detected_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists wazuh_alerts_detected_at_idx
  on public.wazuh_alerts (detected_at desc);

alter table public.wazuh_alerts enable row level security;

revoke all on public.wazuh_alerts from anon, authenticated;

grant select on public.wazuh_alerts to authenticated;

create policy "admin reads wazuh alerts"
  on public.wazuh_alerts
  for select
  to authenticated
  using (public.is_admin());
