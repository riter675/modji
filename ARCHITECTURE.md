# MODJI architecture (current state)

## Implemented web path

`apps/web` is a Next.js 15 TypeScript application. The browser renders MapLibre GL JS with OpenFreeMap styles and OpenStreetMap data/attribution. Server route handlers proxy explicit place searches to Nominatim, road routing to Valhalla, and optional traffic flow/incidents to HERE. Provider calls are isolated from browser credentials; HERE traffic requires `HERE_TRAFFIC_API_KEY` on the server.

The current route handlers are development-scale adapters, not a versioned public API. Nominatim and the public Valhalla demo have usage limits and are not production commercial backends.

## Data foundation (not yet connected to the app)

`docker-compose.yml` defines local PostGIS and Redis. `infrastructure/database/migrations/001_initial.sql` defines the initial spatial and account-oriented schema. The migration is mounted as a first-boot initialization script. No application repository, migration runner, Redis client, or durable authentication flow is connected yet. Docker and `psql` were unavailable when this was documented, so the migration has not been executed here.

## Intended next architecture

Keep a modular monolith: a versioned Fastify API with validated domain contracts, provider adapters, repositories for PostgreSQL/PostGIS, Redis-backed rate limits/cache/queues, and a worker for expiring reports and provider refreshes. Share typed contracts with web and Expo mobile apps. Add WebSockets only for live features that need them. Do not split services before deployment or load evidence requires it.

## Data boundaries

- Map rendering, tile source, geographic data and attribution are distinct concerns.
- Provider results retain provider identity, timestamps, coverage and licensing/retention constraints.
- Community reports remain unverified until corroborated; expiry is mandatory.
- Raw GPS traces are not included in the initial schema.
- Secrets remain in environment variables or a deployment secret manager, never in PostgreSQL or client bundles.

See `IMPLEMENTATION_PLAN.md`, `DATA_SOURCES.md`, and `DATABASE.md` for the current scope and limitations.
