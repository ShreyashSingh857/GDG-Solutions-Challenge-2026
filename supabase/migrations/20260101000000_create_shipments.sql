create extension if not exists pgcrypto;

create table if not exists public.shipments (
  id text primary key,
  origin text not null,
  destination text not null,
  origin_lat double precision not null,
  origin_lng double precision not null,
  dest_lat double precision not null,
  dest_lng double precision not null,
  current_lat double precision not null,
  current_lng double precision not null,
  status text not null,
  mode text not null,
  carrier text not null,
  cargo_value_usd numeric(14,2) not null,
  payment_amount_usd numeric(14,2) not null,
  payment_status text not null,
  import_export text not null,
  departure_date timestamptz not null,
  tracking_number text not null,
  eta timestamptz not null,
  corridor text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shipments_status on public.shipments (status);
create index if not exists idx_shipments_corridor on public.shipments (corridor);
create unique index if not exists idx_shipments_tracking_number on public.shipments (tracking_number);
