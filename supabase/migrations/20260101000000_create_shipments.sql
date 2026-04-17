create table if not exists public.shipments (
  id                 text primary key,
  origin             text not null,
  destination        text not null,
  origin_lat         double precision not null,
  origin_lng         double precision not null,
  dest_lat           double precision not null,
  dest_lng           double precision not null,
  current_lat        double precision,
  current_lng        double precision,
  status             text not null default 'active'
                     check (status in ('active', 'delayed', 'rerouted', 'disrupted')),
  carrier            text not null,
  cargo_value_usd    bigint,
  eta                timestamptz,
  corridor           text,
  mode               text not null default 'sea-freight'
                     check (mode in ('sea-freight', 'air-freight', 'rail', 'road')),
  payment_amount_usd bigint,
  payment_status     text not null default 'pending'
                     check (payment_status in ('pending', 'paid', 'overdue', 'partial')),
  import_export      text not null default 'export'
                     check (import_export in ('import', 'export', 'transit')),
  departure_date     timestamptz,
  tracking_number    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists shipments_updated_at on public.shipments;
create trigger shipments_updated_at
  before update on public.shipments
  for each row execute function update_updated_at_column();

create index if not exists idx_shipments_status on public.shipments(status);
create index if not exists idx_shipments_corridor on public.shipments(corridor);
create index if not exists idx_shipments_import_export on public.shipments(import_export);
create index if not exists idx_shipments_payment on public.shipments(payment_status);
create index if not exists idx_shipments_created on public.shipments(created_at desc);

alter table public.shipments enable row level security;

drop policy if exists "service_role_all" on public.shipments;
create policy "service_role_all" on public.shipments
  for all to service_role using (true) with check (true);

drop policy if exists "auth_read" on public.shipments;
create policy "auth_read" on public.shipments
  for select to authenticated using (true);
