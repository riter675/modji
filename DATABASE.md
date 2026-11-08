# Database foundation

The initial PostgreSQL migration enables PostGIS and defines users, preferences, saved places, search history, journeys, stops, navigation-session metadata, community reports/votes, traffic observations, provider settings/coverage, and audit events. Geographic and time-oriented indexes are included.

Navigation-session records intentionally omit GPS traces. Traffic observations have explicit provider timestamps and expiry. Provider credentials are not stored in PostgreSQL.

## Local services

With Docker Compose installed, run `docker compose up -d postgres redis`. The services bind only to localhost. The first database initialization runs `infrastructure/database/migrations/001_initial.sql`; it runs only when the PostgreSQL data volume is created. Reapplying later migrations needs a migration runner.

The default passwords are local-development placeholders. Set `POSTGRES_PASSWORD` and `REDIS_PASSWORD` in an ignored `.env` file before exposing services beyond localhost. This compose file is not a production deployment configuration.

## Community reports on Vercel

The web app uses Neon PostgreSQL with PostGIS through `pg`, preferring `MODJI_DATABASE_URL_POOLED` and falling back to the existing generic PostgreSQL variables. The full spatial schema in migration 001 and the app's `modji_*` accounts, sessions, favorites, journeys, and community report tables in migration 003 have been applied to the Neon project in Europe Central. The app also creates its feature tables idempotently on first API use.

Reporter identities are anonymous random browser tokens; only SHA-256 hashes are stored. The cookie is HttpOnly and Secure in production. Reports expire after two hours, with a per-identity limit of five submissions per hour. Account passwords are SHA-256 pre-hashed then bcrypt-hashed to avoid bcrypt's 72-byte limit; sessions store only SHA-256 token hashes. Redis rate limits use Upstash when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are configured; database limits remain the fallback. Spatial schema is now live in Neon. Spatial application queries still need to be migrated from numeric-coordinate bounding boxes to PostGIS operators.
