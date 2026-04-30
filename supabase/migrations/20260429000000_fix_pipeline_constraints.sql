-- Run in Supabase SQL Editor

-- 1. Drop FK constraints blocking pipeline writes
ALTER TABLE public.impact_reports        DROP CONSTRAINT IF EXISTS impact_reports_disruption_id_fkey;
ALTER TABLE public.impact_report_shipments DROP CONSTRAINT IF EXISTS impact_report_shipments_impact_report_id_fkey;
ALTER TABLE public.resolution_options    DROP CONSTRAINT IF EXISTS resolution_options_resolution_id_fkey;
ALTER TABLE public.resolutions           DROP CONSTRAINT IF EXISTS resolutions_impact_report_id_fkey;
ALTER TABLE public.resolutions           DROP CONSTRAINT IF EXISTS resolutions_disruption_id_fkey;

-- 2. Add missing updated_at to resolutions (resolution service writes this column)
ALTER TABLE public.resolutions ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
