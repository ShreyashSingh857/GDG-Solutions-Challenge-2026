-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.agent_events (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  trace_id text NOT NULL,
  agent_id USER-DEFINED NOT NULL,
  topic USER-DEFINED NOT NULL,
  payload_type text NOT NULL,
  payload jsonb NOT NULL,
  published_at timestamp with time zone NOT NULL DEFAULT now(),
  ack_at timestamp with time zone,
  retry_count smallint NOT NULL DEFAULT 0,
  CONSTRAINT agent_events_pkey PRIMARY KEY (id)
);
CREATE TABLE public.agent_metrics (
  id bigint NOT NULL DEFAULT nextval('agent_metrics_id_seq'::regclass),
  agent text NOT NULL,
  processed integer DEFAULT 0,
  errors integer DEFAULT 0,
  avg_latency_ms integer,
  recorded_at timestamp with time zone DEFAULT now(),
  CONSTRAINT agent_metrics_pkey PRIMARY KEY (id)
);
CREATE TABLE public.api_keys (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id text NOT NULL,
  label text,
  key_hash text NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  last_used timestamp with time zone,
  CONSTRAINT api_keys_pkey PRIMARY KEY (id)
);
CREATE TABLE public.canal_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  canal text CHECK (canal = ANY (ARRAY['suez'::text, 'panama'::text])),
  status text,
  headline text,
  detected_at timestamp with time zone DEFAULT now(),
  CONSTRAINT canal_events_pkey PRIMARY KEY (id)
);
CREATE TABLE public.capabilities (
  id smallint NOT NULL DEFAULT nextval('capabilities_id_seq'::regclass),
  name text NOT NULL UNIQUE,
  CONSTRAINT capabilities_pkey PRIMARY KEY (id)
);
CREATE TABLE public.disruptions (
  id text NOT NULL,
  trace_id text NOT NULL UNIQUE,
  type USER-DEFINED NOT NULL,
  severity smallint NOT NULL CHECK (severity >= 1 AND severity <= 10),
  location text NOT NULL,
  epicenter_lat numeric NOT NULL,
  epicenter_lng numeric NOT NULL,
  affected_zones ARRAY NOT NULL DEFAULT '{}'::text[],
  confidence numeric NOT NULL CHECK (confidence >= 0::numeric AND confidence <= 1::numeric),
  raw_description text NOT NULL,
  weather_data jsonb,
  published boolean NOT NULL DEFAULT false,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamp with time zone,
  detected_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  org_id text,
  CONSTRAINT disruptions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.errors (
  id bigint NOT NULL DEFAULT nextval('errors_id_seq'::regclass),
  service text NOT NULL,
  trace_id text,
  error_msg text NOT NULL,
  stack text,
  context jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT errors_pkey PRIMARY KEY (id)
);
CREATE TABLE public.impact_report_shipments (
  id bigint NOT NULL DEFAULT nextval('impact_report_shipments_id_seq'::regclass),
  impact_report_id text NOT NULL,
  shipment_id text NOT NULL,
  distance_km integer NOT NULL,
  impact_score numeric NOT NULL CHECK (impact_score >= 0::numeric AND impact_score <= 1::numeric),
  cargo_value_usd integer NOT NULL,
  carrier text NOT NULL,
  origin text NOT NULL,
  destination text NOT NULL,
  corridor text NOT NULL,
  current_lat numeric NOT NULL,
  current_lng numeric NOT NULL,
  status_at_impact USER-DEFINED NOT NULL DEFAULT 'active'::shipment_status,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT impact_report_shipments_pkey PRIMARY KEY (id)
);
CREATE TABLE public.impact_reports (
  id text NOT NULL,
  disruption_id text NOT NULL,
  trace_id text NOT NULL,
  cascade_risk USER-DEFINED NOT NULL DEFAULT 'LOW'::cascade_risk,
  urgency smallint NOT NULL CHECK (urgency >= 1 AND urgency <= 10),
  total_cargo_at_risk_usd bigint NOT NULL DEFAULT 0,
  analysis_text text NOT NULL,
  shipment_count smallint NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT impact_reports_pkey PRIMARY KEY (id)
);
CREATE TABLE public.news_alert_dedup (
  external_id text NOT NULL,
  source_url text NOT NULL,
  processed_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT news_alert_dedup_pkey PRIMARY KEY (external_id)
);
CREATE TABLE public.news_alerts (
  id text NOT NULL,
  source_url text NOT NULL,
  headline text NOT NULL,
  summary text,
  source text,
  published_at timestamp with time zone,
  detected_at timestamp with time zone NOT NULL DEFAULT now(),
  relevance_score double precision NOT NULL DEFAULT 0 CHECK (relevance_score >= 0::double precision AND relevance_score <= 1::double precision),
  disruption_type text NOT NULL DEFAULT 'OTHER'::text CHECK (disruption_type = ANY (ARRAY['WEATHER'::text, 'STRIKE'::text, 'GEOPOLITICAL'::text, 'INFRASTRUCTURE'::text, 'OTHER'::text])),
  severity integer NOT NULL DEFAULT 5 CHECK (severity >= 1 AND severity <= 10),
  location text,
  epicenter_lat double precision,
  epicenter_lng double precision,
  affected_corridors ARRAY,
  api_source text DEFAULT 'gdelt'::text,
  injected boolean NOT NULL DEFAULT false,
  CONSTRAINT news_alerts_pkey PRIMARY KEY (id)
);
CREATE TABLE public.outbound_webhooks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id text NOT NULL,
  event text NOT NULL,
  url text NOT NULL,
  secret text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT outbound_webhooks_pkey PRIMARY KEY (id)
);
CREATE TABLE public.port_congestion (
  id bigint NOT NULL DEFAULT nextval('port_congestion_id_seq'::regclass),
  locode text NOT NULL,
  port_name text,
  congestion_score integer,
  avg_wait_hours real,
  vessel_count integer,
  fetched_at timestamp with time zone DEFAULT now(),
  CONSTRAINT port_congestion_pkey PRIMARY KEY (id)
);
CREATE TABLE public.push_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id text NOT NULL,
  user_id text NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text,
  auth text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.resolution_options (
  id bigint NOT NULL DEFAULT nextval('resolution_options_id_seq'::regclass),
  resolution_id text NOT NULL,
  trace_id text NOT NULL,
  rank smallint NOT NULL CHECK (rank = ANY (ARRAY[1, 2, 3])),
  title text NOT NULL,
  description text NOT NULL,
  cost_delta integer NOT NULL,
  time_delta integer NOT NULL,
  supplier_id text,
  supplier_name text NOT NULL,
  confidence numeric NOT NULL CHECK (confidence >= 0::numeric AND confidence <= 1::numeric),
  route_geojson jsonb NOT NULL,
  transport_mode USER-DEFINED NOT NULL DEFAULT 'sea-freight'::transport_mode,
  selected boolean NOT NULL DEFAULT false,
  executed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT resolution_options_pkey PRIMARY KEY (id),
  CONSTRAINT resolution_options_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id)
);
CREATE TABLE public.resolutions (
  id text NOT NULL,
  trace_id text NOT NULL UNIQUE,
  impact_report_id text NOT NULL,
  disruption_id text NOT NULL,
  cascade_risk USER-DEFINED NOT NULL,
  urgency smallint NOT NULL,
  total_cargo_at_risk_usd bigint NOT NULL,
  analysis_text text NOT NULL,
  option_count smallint NOT NULL DEFAULT 3,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'resolved'::text, 'expired'::text])),
  selected_rank smallint CHECK (selected_rank = ANY (ARRAY[1, 2, 3])),
  resolved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  org_id text,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT resolutions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.shipments (
  id text NOT NULL,
  origin text NOT NULL,
  destination text NOT NULL,
  origin_lat double precision NOT NULL,
  origin_lng double precision NOT NULL,
  dest_lat double precision NOT NULL,
  dest_lng double precision NOT NULL,
  current_lat double precision,
  current_lng double precision,
  status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'delayed'::text, 'rerouted'::text, 'disrupted'::text])),
  carrier text NOT NULL,
  cargo_value_usd bigint,
  eta timestamp with time zone,
  corridor text,
  mode text NOT NULL DEFAULT 'sea-freight'::text CHECK (mode = ANY (ARRAY['sea-freight'::text, 'air-freight'::text, 'rail'::text, 'road'::text])),
  payment_amount_usd bigint,
  payment_status text NOT NULL DEFAULT 'pending'::text CHECK (payment_status = ANY (ARRAY['pending'::text, 'paid'::text, 'overdue'::text, 'partial'::text])),
  import_export text NOT NULL DEFAULT 'export'::text CHECK (import_export = ANY (ARRAY['import'::text, 'export'::text, 'transit'::text])),
  departure_date timestamp with time zone,
  tracking_number text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  org_id text,
  CONSTRAINT shipments_pkey PRIMARY KEY (id)
);
CREATE TABLE public.supplier_capabilities (
  supplier_id text NOT NULL,
  capability_id smallint NOT NULL,
  certified_at date,
  expires_at date,
  CONSTRAINT supplier_capabilities_pkey PRIMARY KEY (supplier_id, capability_id),
  CONSTRAINT supplier_capabilities_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id),
  CONSTRAINT supplier_capabilities_capability_id_fkey FOREIGN KEY (capability_id) REFERENCES public.capabilities(id)
);
CREATE TABLE public.suppliers (
  id text NOT NULL,
  name text NOT NULL,
  region text NOT NULL,
  base_cost_per_km numeric NOT NULL,
  reliability_score smallint NOT NULL CHECK (reliability_score >= 0 AND reliability_score <= 100),
  contact_email text,
  website text,
  headquarters_country text,
  is_active boolean NOT NULL DEFAULT true,
  max_cargo_tons numeric,
  insurance_coverage text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT suppliers_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_orgs (
  user_id text NOT NULL,
  org_id text NOT NULL,
  role text NOT NULL DEFAULT 'viewer'::text CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'analyst'::text, 'viewer'::text])),
  CONSTRAINT user_orgs_pkey PRIMARY KEY (user_id, org_id)
);
CREATE TABLE public.vessel_positions (
  mmsi text NOT NULL,
  lat double precision,
  lng double precision,
  speed real,
  heading real,
  nav_status integer,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT vessel_positions_pkey PRIMARY KEY (mmsi)
);