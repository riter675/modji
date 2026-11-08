-- Standalone Postgres schema for community reports. Coordinates stay as numeric
-- columns so this feature works on managed Postgres without PostGIS.
CREATE TABLE IF NOT EXISTS modji_reporters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash char(64) UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS modji_community_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES modji_reporters(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('accident','congestion','slow_traffic','roadworks','road_closure','hazard','object_on_road','vehicle_breakdown','other')),
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  description varchar(500),
  status text NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified','confirmed','resolved','expired','rejected')),
  validation_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '2 hours',
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS modji_reports_active_expiry_idx ON modji_community_reports (status, expires_at);
CREATE INDEX IF NOT EXISTS modji_reports_coordinates_idx ON modji_community_reports (latitude, longitude);
CREATE TABLE IF NOT EXISTS modji_report_votes (
  report_id uuid NOT NULL REFERENCES modji_community_reports(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES modji_reporters(id) ON DELETE CASCADE,
  vote text NOT NULL CHECK (vote IN ('confirm','resolved','incorrect')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, reporter_id)
);
