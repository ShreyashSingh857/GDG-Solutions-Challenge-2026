create table if not exists public.news_alerts (
  id                  text primary key,
  source_url          text not null,
  headline            text not null,
  summary             text,
  source              text,
  published_at        timestamptz,
  detected_at         timestamptz not null default now(),
  relevance_score     double precision not null default 0
                      check (relevance_score >= 0 and relevance_score <= 1),
  disruption_type     text not null default 'OTHER'
                      check (disruption_type in ('WEATHER', 'STRIKE', 'GEOPOLITICAL', 'INFRASTRUCTURE', 'OTHER')),
  severity            integer not null default 5
                      check (severity >= 1 and severity <= 10),
  location            text,
  epicenter_lat       double precision,
  epicenter_lng       double precision,
  affected_corridors  text[],
  api_source          text default 'gdelt',
  injected            boolean not null default false
);

create index if not exists idx_news_alerts_detected on public.news_alerts(detected_at desc);
create index if not exists idx_news_alerts_relevance on public.news_alerts(relevance_score desc);
create index if not exists idx_news_alerts_type on public.news_alerts(disruption_type);

alter table public.news_alerts enable row level security;

drop policy if exists "service_role_all" on public.news_alerts;
create policy "service_role_all" on public.news_alerts
  for all to service_role using (true) with check (true);

drop policy if exists "auth_read" on public.news_alerts;
create policy "auth_read" on public.news_alerts
  for select to authenticated using (true);
