# Database foundation

The initial PostgreSQL migration enables PostGIS and defines users, preferences, saved places, search history, journeys, stops, navigation-session metadata, community reports/votes, traffic observations, provider settings/coverage, and audit events. Geographic and time-oriented indexes are included.

Navigation-session records intentionally omit GPS traces. Traffic observations have explicit provider timestamps and expiry. Provider credentials are not stored in PostgreSQL.

## Local services

With Docker Compose installed, run `docker compose up -d postgres redis`. The services bind only to localhost. The first database initialization runs `infrastructure/database/migrations/001_initial.sql`; it runs only when the PostgreSQL data volume is created. Reapplying later migrations needs a migration runner.

The default passwords are local-development placeholders. Set `POSTGRES_PASSWORD` and `REDIS_PASSWORD` in an ignored `.env` file before exposing services beyond localhost. This compose file is not a production deployment configuration.

## Community reports on Vercel

The web app uses Neon PostgreSQL with PostGIS through `pg`, preferring `MODJI_DATABASE_URL_POOLED` and falling back to the existing generic PostgreSQL variables. The full spatial schema in migration 001, the app's `modji_*` accounts, sessions, favorites, journeys, and community report tables in migration 003, and the generated PostGIS locations plus GiST indexes in migration 004 have been applied to the Neon project in Europe Central. The app also creates its feature tables idempotently on first API use.

Vercel Production and Preview use the Neon connection and Upstash REST variables (`MODJI_DATABASE_URL_POOLED`, `UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN`). Keep their values in the Vercel secret store; do not commit them in this repository.

Reporter identities are anonymous random browser tokens; only SHA-256 hashes are stored. The cookie is HttpOnly and Secure in production. Reports expire after two hours, with a per-identity limit of five submissions per hour. Account passwords are SHA-256 pre-hashed then bcrypt-hashed to avoid bcrypt's 72-byte limit; sessions store only SHA-256 token hashes. Redis rate limits use Upstash when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are configured; database limits remain the fallback. Community report map bounds use the indexed PostGIS geometry, and duplicate detection uses a 50-meter geography distance.
