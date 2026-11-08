# Database foundation

The initial PostgreSQL migration enables PostGIS and defines users, preferences, saved places, search history, journeys, stops, navigation-session metadata, community reports/votes, traffic observations, provider settings/coverage, and audit events. Geographic and time-oriented indexes are included.

Navigation-session records intentionally omit GPS traces. Traffic observations have explicit provider timestamps and expiry. Provider credentials are not stored in PostgreSQL.

## Local services

With Docker Compose installed, run `docker compose up -d postgres redis`. The services bind only to localhost. The first database initialization runs `infrastructure/database/migrations/001_initial.sql`; it runs only when the PostgreSQL data volume is created. Reapplying later migrations needs a migration runner.

The default passwords are local-development placeholders. Set `POSTGRES_PASSWORD` and `REDIS_PASSWORD` in an ignored `.env` file before exposing services beyond localhost. This compose file is not a production deployment configuration.

## Community reports on Vercel

The web app uses the Vercel-connected Prisma Postgres database through `pg` and `DATABASE_URL_POOLED` (falling back to the provider's standard URL variables). On its first community API request, it creates the small `modji_reporters`, `modji_community_reports` and `modji_report_votes` tables with idempotent DDL. This subset uses latitude/longitude columns and does not require PostGIS. See `infrastructure/database/migrations/002_community_reports.sql` for the equivalent standalone migration.

Reporter identities are anonymous random browser tokens; only SHA-256 hashes are stored. The cookie is HttpOnly and Secure in production. Reports expire after two hours, with a per-identity limit of five submissions per hour. The larger PostGIS schema in migration 001 is still a design scaffold and has not been applied to Prisma Postgres.
