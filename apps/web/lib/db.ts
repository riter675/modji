import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & { modjiPool?: Pool };
let schemaSetup: Promise<void> | undefined;

async function ensureCommunitySchema(pool: Pool) {
  if (!schemaSetup) schemaSetup = (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS modji_reporters (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token_hash char(64) UNIQUE NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS modji_community_reports (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reporter_id uuid NOT NULL REFERENCES modji_reporters(id) ON DELETE CASCADE, category text NOT NULL CHECK (category IN ('accident','congestion','slow_traffic','roadworks','road_closure','hazard','object_on_road','vehicle_breakdown','other')), latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90), longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180), description varchar(500), status text NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified','confirmed','resolved','expired','rejected')), validation_count integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now() + interval '2 hours', resolved_at timestamptz)`);
    await pool.query("CREATE INDEX IF NOT EXISTS modji_reports_active_expiry_idx ON modji_community_reports (status, expires_at)");
    await pool.query("CREATE INDEX IF NOT EXISTS modji_reports_coordinates_idx ON modji_community_reports (latitude, longitude)");
    await pool.query("CREATE TABLE IF NOT EXISTS modji_report_votes (report_id uuid NOT NULL REFERENCES modji_community_reports(id) ON DELETE CASCADE, reporter_id uuid NOT NULL REFERENCES modji_reporters(id) ON DELETE CASCADE, vote text NOT NULL CHECK (vote IN ('confirm','resolved','incorrect')), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (report_id, reporter_id))");
  })().catch((error) => { schemaSetup = undefined; throw error; });
  return schemaSetup;
}

export function getPool() {
  const connectionString = process.env.DATABASE_URL_POOLED ?? process.env.DATABASE_POSTGRES_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Database is not configured.");
  if (!globalForDb.modjiPool) {
    globalForDb.modjiPool = new Pool({ connectionString, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 8000, ssl: connectionString.includes("localhost") ? undefined : { rejectUnauthorized: false } });
  }
  const pool = globalForDb.modjiPool;
  // First request creates only the community-report tables, without requiring
  // PostGIS or an out-of-band migration command. This DDL is idempotent.
  const setup = ensureCommunitySchema(pool);
  // Attach setup to pool queries through a tiny lazy marker; routes await this
  // before accessing feature tables.
  pendingSetup = setup;
  return globalForDb.modjiPool;
}

let pendingSetup: Promise<void> = Promise.resolve();
export async function ensureDatabaseReady() { await pendingSetup; }

