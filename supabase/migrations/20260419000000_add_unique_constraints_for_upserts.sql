do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'impact_report_shipments'
      and c.conname = 'impact_report_shipments_impact_report_id_shipment_id_key'
  ) then
    alter table public.impact_report_shipments
      add constraint impact_report_shipments_impact_report_id_shipment_id_key
      unique (impact_report_id, shipment_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'resolution_options'
      and c.conname = 'resolution_options_resolution_id_rank_key'
  ) then
    alter table public.resolution_options
      add constraint resolution_options_resolution_id_rank_key
      unique (resolution_id, rank);
  end if;
end $$;