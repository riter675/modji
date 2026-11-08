# Technical decisions

## Current decisions

- **TypeScript and pnpm:** one repository and shared type safety; current workspace contains the web app only, not yet a full Turborepo monorepo.
- **Next.js and MapLibre GL JS:** deliver an interactive web mapping experience with provider calls kept in server routes.
- **OpenFreeMap + OpenStreetMap:** real global map rendering for development. Respect style/data attribution and service terms; do not assume public endpoints are a commercial production SLA.
- **Nominatim:** explicit low-volume development search fallback, not production autocomplete or a commercial search backend.
- **Valhalla:** real road-network route calculation for driving, walking and cycling. Public demo is development-only; deploy or license a suitable service for production.
- **HERE Traffic API v7:** credential-gated flow and incident source. Never substitute fabricated traffic when unavailable.
- **PostgreSQL/PostGIS and Redis:** intended persistence/cache foundation, scaffolded through Compose and SQL but not yet connected or runtime-verified.
- **Privacy:** do not persist raw navigation GPS traces by default; require explicit consent and aggregation safeguards before any mobility analytics.

## Revisit when

- Search moves from Nominatim to a production provider: add provider-specific licensing, autocomplete, reverse-geocoding, coverage and cache rules.
- API is introduced: implement Fastify, versioned contracts, OpenAPI, authentication, authorization, rate limits and operational telemetry.
- Mobile begins: use Expo development builds and verify MapLibre/native location/TTS on actual Android and iOS devices; Expo Go compatibility is not assumed.
- Production traffic is enabled: record regional coverage, freshness, service limits, credentials and failure behavior.
