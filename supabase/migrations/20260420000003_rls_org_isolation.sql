alter table if exists public.disruptions add column if not exists org_id text;
alter table if exists public.shipments add column if not exists org_id text;
alter table if exists public.resolutions add column if not exists org_id text;
alter table if exists public.outbound_webhooks add column if not exists org_id text;
alter table if exists public.push_subscriptions add column if not exists org_id text;

create table if not exists public.user_orgs (
  user_id   text not null,
  org_id    text not null,
  role      text not null default 'viewer' check (role in ('owner', 'admin', 'analyst', 'viewer')),
  primary key (user_id, org_id)
);

alter table if exists public.user_orgs enable row level security;

drop policy if exists "service_role_all_user_orgs" on public.user_orgs;
create policy "service_role_all_user_orgs" on public.user_orgs
  for all to service_role using (true) with check (true);

drop policy if exists "auth_read_user_orgs" on public.user_orgs;
create policy "auth_read_user_orgs" on public.user_orgs
  for select to authenticated using (true);

do $$
begin
  if to_regclass('public.disruptions') is not null then
    execute 'alter table public.disruptions enable row level security';
    execute 'drop policy if exists org_isolation_disruptions on public.disruptions';
    execute 'create policy org_isolation_disruptions on public.disruptions for select to authenticated using (org_id = (select org_id from public.user_orgs where user_id = auth.uid()::text limit 1))';
  end if;

  if to_regclass('public.shipments') is not null then
    execute 'alter table public.shipments enable row level security';
    execute 'drop policy if exists org_isolation_shipments on public.shipments';
    execute 'create policy org_isolation_shipments on public.shipments for select to authenticated using (org_id = (select org_id from public.user_orgs where user_id = auth.uid()::text limit 1))';
  end if;

  if to_regclass('public.resolutions') is not null then
    execute 'alter table public.resolutions enable row level security';
    execute 'drop policy if exists org_isolation_resolutions on public.resolutions';
    execute 'create policy org_isolation_resolutions on public.resolutions for select to authenticated using (org_id = (select org_id from public.user_orgs where user_id = auth.uid()::text limit 1))';
  end if;
end $$;
