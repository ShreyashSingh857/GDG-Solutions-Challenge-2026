create table if not exists public.news_alert_dedup (
  external_id   text primary key,
  source_url    text not null,
  processed_at  timestamptz not null default now()
);

create index if not exists idx_news_alert_dedup_processed_at on public.news_alert_dedup(processed_at desc);

alter table public.news_alert_dedup enable row level security;

drop policy if exists "service_role_all_news_alert_dedup" on public.news_alert_dedup;
create policy "service_role_all_news_alert_dedup" on public.news_alert_dedup
  for all to service_role using (true) with check (true);
