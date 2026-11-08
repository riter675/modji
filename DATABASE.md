# Database foundation

The initial PostgreSQL migration enables PostGIS and defines users, preferences, saved places, search history, journeys, stops, navigation-session metadata, community reports/votes, traffic observations, provider settings/coverage, and audit events. Geographic and time-oriented indexes are included.

Navigation-session records intentionally omit GPS traces. Traffic observations have explicit provider timestamps and expiry. Provider credentials are not stored in PostgreSQL.

## Local services

With Docker Compose installed, run `docker compose up -d postgres redis`. The services bind only to localhost. The first database initialization runs `infrastructure/database/migrations/001_initial.sql`; it runs only when the PostgreSQL data volume is created. Reapplying later migrations needs a migration runner.

The default passwords are local-development placeholders. Set `POSTGRES_PASSWORD` and `REDIS_PASSWORD` in an ignored `.env` file before exposing services beyond localhost. This compose file is not a production deployment configuration.

**Verification:** this workspace did not have Docker or `psql`, so the migration and services have not been started here. No app persistence path uses these tables yet.
