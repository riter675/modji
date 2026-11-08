CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE community_report_category AS ENUM (
  'accident', 'congestion', 'slow_traffic', 'roadworks', 'road_closure',
  'hazard', 'object_on_road', 'vehicle_breakdown', 'other'
);
CREATE TYPE community_report_status AS ENUM (
  'unverified', 'confirmed', 'resolved', 'expired', 'rejected'
);
CREATE TYPE report_vote_type AS ENUM ('confirm', 'resolved', 'incorrect');
CREATE TYPE provider_coverage_status AS ENUM (
  'supported', 'partially_supported', 'provider_unavailable', 'quality_uncertain', 'not_verified'
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz
);
CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));

CREATE TABLE profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name text,
  preferred_mode text NOT NULL DEFAULT 'auto' CHECK (preferred_mode IN ('auto', 'pedestrian', 'bicycle')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  locale text NOT NULL DEFAULT 'en',
  distance_unit text NOT NULL DEFAULT 'metric' CHECK (distance_unit IN ('metric', 'imperial')),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE saved_places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label text NOT NULL,
  address text,
  location geography(Point, 4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, label)
);
CREATE INDEX saved_places_location_gix ON saved_places USING gist (location);
CREATE INDEX saved_places_user_created_idx ON saved_places (user_id, created_at DESC);

CREATE TABLE search_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query text NOT NULL,
  selected_label text,
  selected_location geography(Point, 4326),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX search_history_user_created_idx ON search_history (user_id, created_at DESC);
CREATE INDEX search_history_location_gix ON search_history USING gist (selected_location);

CREATE TABLE journeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  origin_label text,
  destination_label text,
  origin geography(Point, 4326),
  destination geography(Point, 4326),
  transport_mode text NOT NULL CHECK (transport_mode IN ('auto', 'pedestrian', 'bicycle')),
  distance_meters double precision,
  duration_seconds double precision,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX journeys_user_created_idx ON journeys (user_id, created_at DESC);
CREATE INDEX journeys_origin_gix ON journeys USING gist (origin);
CREATE INDEX journeys_destination_gix ON journeys USING gist (destination);

CREATE TABLE journey_stops (
  journey_id uuid NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence >= 0),
  label text,
  location geography(Point, 4326) NOT NULL,
  PRIMARY KEY (journey_id, sequence)
);
CREATE INDEX journey_stops_location_gix ON journey_stops USING gist (location);

-- Store navigation session metadata only. Do not persist raw GPS traces by default.
CREATE TABLE navigation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  journey_id uuid REFERENCES journeys(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('preparing', 'ready', 'navigating', 'off_route', 'paused', 'arrived', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX navigation_sessions_user_started_idx ON navigation_sessions (user_id, started_at DESC);

CREATE TABLE community_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category community_report_category NOT NULL,
  location geography(Point, 4326) NOT NULL,
  description text CHECK (description IS NULL OR length(description) <= 500),
  status community_report_status NOT NULL DEFAULT 'unverified',
  confidence numeric(4,3) NOT NULL DEFAULT 0.25 CHECK (confidence >= 0 AND confidence <= 1),
  validation_count integer NOT NULL DEFAULT 0 CHECK (validation_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '2 hours',
  resolved_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX community_reports_location_gix ON community_reports USING gist (location);
CREATE INDEX community_reports_active_created_idx ON community_reports (status, created_at DESC) WHERE status IN ('unverified', 'confirmed');
CREATE INDEX community_reports_expires_idx ON community_reports (expires_at) WHERE status IN ('unverified', 'confirmed');

CREATE TABLE report_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES community_reports(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote report_vote_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, user_id)
);
CREATE INDEX report_votes_report_created_idx ON report_votes (report_id, created_at DESC);

CREATE TABLE traffic_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  source_updated_at timestamptz,
  observed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  category text,
  confidence numeric(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  location geography(Geometry, 4326) NOT NULL
);
CREATE INDEX traffic_observations_location_gix ON traffic_observations USING gist (location);
CREATE INDEX traffic_observations_freshness_idx ON traffic_observations (provider, source_updated_at DESC, expires_at);
CREATE INDEX traffic_observations_expires_idx ON traffic_observations (expires_at);

CREATE TABLE provider_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  product text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, product)
);
-- Credentials belong in a secret manager/environment, never in this table.

CREATE TABLE provider_coverage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  product text NOT NULL,
  region_code text NOT NULL,
  status provider_coverage_status NOT NULL DEFAULT 'not_verified',
  checked_at timestamptz,
  coverage_area geography(MultiPolygon, 4326),
  notes text,
  UNIQUE (provider, product, region_code)
);
CREATE INDEX provider_coverage_area_gix ON provider_coverage USING gist (coverage_area);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  subject_type text NOT NULL,
  subject_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_created_idx ON audit_events (created_at DESC);
CREATE INDEX audit_events_subject_idx ON audit_events (subject_type, subject_id, created_at DESC);
