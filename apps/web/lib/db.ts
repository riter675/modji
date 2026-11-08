import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & { modjiPool?: Pool };
let schemaSetup: Promise<void> | undefined;

async function ensureAppSchema(pool: Pool) {
  if (!schemaSetup) schemaSetup = (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS modji_users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE, password_hash text NOT NULL, display_name text NOT NULL DEFAULT '', preferred_mode text NOT NULL DEFAULT 'auto' CHECK (preferred_mode IN ('auto','pedestrian','bicycle')), locale text NOT NULL DEFAULT 'en', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), disabled_at timestamptz)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS modji_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES modji_users(id) ON DELETE CASCADE, token_hash char(64) UNIQUE NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, last_seen_at timestamptz NOT NULL DEFAULT now())`);
    await pool.query("CREATE INDEX IF NOT EXISTS modji_sessions_user_expiry_idx ON modji_sessions (user_id, expires_at)");
    await pool.query(`CREATE TABLE IF NOT EXISTS modji_login_attempts (email_hash char(64) NOT NULL, attempted_at timestamptz NOT NULL DEFAULT now())`);
    await pool.query("CREATE INDEX IF NOT EXISTS modji_login_attempts_recent_idx ON modji_login_attempts (email_hash, attempted_at DESC)");
    await pool.query(`CREATE TABLE IF NOT EXISTS modji_register_attempts (email_hash char(64) NOT NULL, attempted_at timestamptz NOT NULL DEFAULT now())`);
    await pool.query("CREATE INDEX IF NOT EXISTS modji_register_attempts_recent_idx ON modji_register_attempts (email_hash, attempted_at DESC)");
    await pool.query(`CREATE TABLE IF NOT EXISTS modji_saved_places (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES modji_users(id) ON DELETE CASCADE, label varchar(80) NOT NULL, address varchar(300), latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90), longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,label))`);
    await pool.query("CREATE INDEX IF NOT EXISTS modji_saved_places_user_created_idx ON modji_saved_places (user_id, created_at DESC)");
    await pool.query(`CREATE TABLE IF NOT EXISTS modji_journeys (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES modji_users(id) ON DELETE CASCADE, origin_label varchar(300), destination_label varchar(300), origin_latitude double precision, origin_longitude double precision, destination_latitude double precision, destination_longitude double precision, transport_mode text NOT NULL CHECK (transport_mode IN ('auto','pedestrian','bicycle')), distance_meters double precision, duration_seconds double precision, created_at timestamptz NOT NULL DEFAULT now())`);
    await pool.query("CREATE INDEX IF NOT EXISTS modji_journeys_user_created_idx ON modji_journeys (user_id, created_at DESC)");
    await pool.query(`CREATE TABLE IF NOT EXISTS modji_reporters (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token_hash char(64) UNIQUE NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS modji_community_reports (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reporter_id uuid NOT NULL REFERENCES modji_reporters(id) ON DELETE CASCADE, category text NOT NULL CHECK (category IN ('accident','congestion','slow_traffic','roadworks','road_closure','hazard','object_on_road','vehicle_breakdown','other')), latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90), longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180), description varchar(500), status text NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified','confirmed','resolved','expired','rejected')), validation_count integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now() + interval '2 hours', resolved_at timestamptz)`);
    await pool.query("CREATE INDEX IF NOT EXISTS modji_reports_active_expiry_idx ON modji_community_reports (status, expires_at)");
    await pool.query("CREATE INDEX IF NOT EXISTS modji_reports_coordinates_idx ON modji_community_reports (latitude, longitude)");
    await pool.query("CREATE TABLE IF NOT EXISTS modji_report_votes (report_id uuid NOT NULL REFERENCES modji_community_reports(id) ON DELETE CASCADE, reporter_id uuid NOT NULL REFERENCES modji_reporters(id) ON DELETE CASCADE, vote text NOT NULL CHECK (vote IN ('confirm','resolved','incorrect')), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (report_id, reporter_id))");
  })().catch((error) => { schemaSetup = undefined; throw error; });
  return schemaSetup;
}

export function getPool() {
  const connectionString = process.env.MODJI_DATABASE_URL_POOLED ?? process.env.DATABASE_URL_POOLED ?? process.env.DATABASE_POSTGRES_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Database is not configured.");
  if (!globalForDb.modjiPool) {
    globalForDb.modjiPool = new Pool({ connectionString, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 8000, ssl: connectionString.includes("localhost") ? undefined : { rejectUnauthorized: false } });
  }
  const pool = globalForDb.modjiPool;
  // First request creates only the community-report tables, without requiring
  // PostGIS or an out-of-band migration command. This DDL is idempotent.
  const setup = ensureAppSchema(pool);
  // Attach setup to pool queries through a tiny lazy marker; routes await this
  // before accessing feature tables.
  pendingSetup = setup;
  return globalForDb.modjiPool;
}

let pendingSetup: Promise<void> = Promise.resolve();
export async function ensureDatabaseReady() { await pendingSetup; }

