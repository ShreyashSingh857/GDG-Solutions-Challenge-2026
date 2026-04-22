create table if not exists public.api_keys (
  id          uuid primary key default gen_random_uuid(),
  org_id      text not null,
  label       text,
  key_hash    text not null unique,
  created_at  timestamptz default now(),
  last_used   timestamptz
);

create index if not exists idx_api_keys_org on public.api_keys(org_id);

create table if not exists public.outbound_webhooks (
  id          uuid primary key default gen_random_uuid(),
  org_id      text not null,
  event       text not null,
  url         text not null,
  secret      text not null,
  active      boolean not null default true,
  created_at  timestamptz default now()
);

create index if not exists idx_outbound_webhooks_org_event on public.outbound_webhooks(org_id, event);

alter table public.api_keys enable row level security;
alter table public.outbound_webhooks enable row level security;

drop policy if exists "service_role_all_api_keys" on public.api_keys;
create policy "service_role_all_api_keys" on public.api_keys
  for all to service_role using (true) with check (true);

drop policy if exists "service_role_all_outbound_webhooks" on public.outbound_webhooks;
create policy "service_role_all_outbound_webhooks" on public.outbound_webhooks
  for all to service_role using (true) with check (true);

drop policy if exists "auth_read_api_keys" on public.api_keys;
create policy "auth_read_api_keys" on public.api_keys
  for select to authenticated using (true);

drop policy if exists "auth_read_outbound_webhooks" on public.outbound_webhooks;
create policy "auth_read_outbound_webhooks" on public.outbound_webhooks
  for select to authenticated using (true);
