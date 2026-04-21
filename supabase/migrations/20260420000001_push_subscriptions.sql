create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  org_id      text not null,
  user_id     text not null,
  endpoint    text not null unique,
  p256dh      text,
  auth        text,
  created_at  timestamptz default now()
);

create index if not exists idx_push_subscriptions_org on public.push_subscriptions(org_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "service_role_all_push_subscriptions" on public.push_subscriptions;
create policy "service_role_all_push_subscriptions" on public.push_subscriptions
  for all to service_role using (true) with check (true);

drop policy if exists "auth_read_push_subscriptions" on public.push_subscriptions;
create policy "auth_read_push_subscriptions" on public.push_subscriptions
  for select to authenticated using (true);
