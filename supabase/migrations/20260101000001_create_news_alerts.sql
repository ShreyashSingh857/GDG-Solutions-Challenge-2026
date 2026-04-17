create extension if not exists pgcrypto;

create table if not exists public.news_alerts (
  id uuid primary key default gen_random_uuid(),
  trace_id text,
  title text not null,
  summary text,
  severity text,
  corridor text,
  source text,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_news_alerts_corridor on public.news_alerts (corridor);
create index if not exists idx_news_alerts_created_at on public.news_alerts (created_at desc);
