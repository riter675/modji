-- Postgres-compatible account/favorites/history subset used by the web app.
-- The broader spatial schema in 001 additionally needs a PostGIS-enabled host.
CREATE TABLE IF NOT EXISTS modji_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  preferred_mode text NOT NULL DEFAULT 'auto' CHECK (preferred_mode IN ('auto','pedestrian','bicycle')),
  locale text NOT NULL DEFAULT 'en',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz
);
CREATE TABLE IF NOT EXISTS modji_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES modji_users(id) ON DELETE CASCADE,
  token_hash char(64) UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS modji_sessions_user_expiry_idx ON modji_sessions(user_id, expires_at);
CREATE TABLE IF NOT EXISTS modji_login_attempts (email_hash char(64) NOT NULL, attempted_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS modji_login_attempts_recent_idx ON modji_login_attempts(email_hash, attempted_at DESC);
CREATE TABLE IF NOT EXISTS modji_register_attempts (email_hash char(64) NOT NULL, attempted_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS modji_register_attempts_recent_idx ON modji_register_attempts(email_hash, attempted_at DESC);
CREATE TABLE IF NOT EXISTS modji_saved_places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES modji_users(id) ON DELETE CASCADE,
  label varchar(80) NOT NULL,
  address varchar(300),
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, label)
);
CREATE INDEX IF NOT EXISTS modji_saved_places_user_created_idx ON modji_saved_places(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS modji_journeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES modji_users(id) ON DELETE CASCADE,
  origin_label varchar(300), destination_label varchar(300),
  origin_latitude double precision, origin_longitude double precision,
  destination_latitude double precision, destination_longitude double precision,
  transport_mode text NOT NULL CHECK (transport_mode IN ('auto','pedestrian','bicycle')),
  distance_meters double precision, duration_seconds double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS modji_journeys_user_created_idx ON modji_journeys(user_id, created_at DESC);
