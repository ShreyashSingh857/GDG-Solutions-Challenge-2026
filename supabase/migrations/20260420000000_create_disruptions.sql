create table if not exists public.disruptions (
  id              text primary key,
  trace_id        text,
  type            text,
  severity        integer,
  location        text,
  epicenter_lat   double precision,
  epicenter_lng   double precision,
  affected_zones  jsonb default '[]'::jsonb,
  confidence      double precision,
  raw_description text,
  weather_data    jsonb,
  published      boolean default true,
  detected_at     timestamptz default now(),
  created_at      timestamptz default now()
);

create index if not exists idx_disruptions_detected on public.disruptions (detected_at desc);
create index if not exists idx_disruptions_type on public.disruptions (type);
create index if not exists idx_disruptions_severity on public.disruptions (severity desc);

alter table public.disruptions enable row level security;

drop policy if exists "service_role_all" on public.disruptions;
create policy "service_role_all" on public.disruptions
  for all to service_role using (true) with check (true);

drop policy if exists "auth_read" on public.disruptions;
create policy "auth_read" on public.disruptions
  for select to authenticated using (true);