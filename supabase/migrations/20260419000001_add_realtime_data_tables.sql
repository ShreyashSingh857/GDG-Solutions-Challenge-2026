-- Live vessel position mirror for AIS stream data
CREATE TABLE IF NOT EXISTS vessel_positions (
  mmsi TEXT PRIMARY KEY,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  speed REAL,
  heading REAL,
  nav_status INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Port congestion snapshots
CREATE TABLE IF NOT EXISTS port_congestion (
  id BIGSERIAL PRIMARY KEY,
  locode TEXT NOT NULL,
  port_name TEXT,
  congestion_score INTEGER,
  avg_wait_hours REAL,
  vessel_count INTEGER,
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_port_congestion_locode ON port_congestion (locode);
CREATE INDEX IF NOT EXISTS idx_port_congestion_fetched_at ON port_congestion (fetched_at DESC);

-- Canal disruption events
CREATE TABLE IF NOT EXISTS canal_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canal TEXT CHECK (canal IN ('suez', 'panama')),
  status TEXT,
  headline TEXT,
  detected_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-agent performance metrics
CREATE TABLE IF NOT EXISTS agent_metrics (
  id BIGSERIAL PRIMARY KEY,
  agent TEXT NOT NULL,
  processed INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  avg_latency_ms INTEGER,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE vessel_positions IS 'Live AIS vessel positions mirrored from Firestore and Supabase for analytics';

-- Enable RLS on realtime tables
ALTER TABLE public.vessel_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.port_congestion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_metrics ENABLE ROW LEVEL SECURITY;

-- Service role full access for ingestion and agent writes
CREATE POLICY "service_role_all" ON public.vessel_positions FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all" ON public.port_congestion FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all" ON public.canal_events FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all" ON public.agent_metrics FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- Authenticated users can read realtime operational data
CREATE POLICY "auth_read" ON public.vessel_positions FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "auth_read" ON public.port_congestion FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "auth_read" ON public.canal_events FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "auth_read" ON public.agent_metrics FOR SELECT TO authenticated USING (TRUE);
