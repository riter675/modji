# Implementation roadmap

1. **Web map and discovery (implemented):** real MapLibre map, Nominatim real place search, browser location, responsive shell. Search categories, autocomplete, reverse geocoding, and HERE Search remain.
2. **Routing foundation (web path implemented):** Valhalla service for driving, walking and cycling; route alternatives, maneuvers and map geometry. Self-hosting and reproducible regional extracts remain.
3. **Navigation (web path implemented):** foreground browser GPS tracking, accuracy-aware off-route status, manual recalculation and browser voice guidance. Native background support and moving-device verification remain.
4. **Traffic (dual path implemented):** HERE Traffic API v7 provides professional flow/incidents when configured. Without its key, the map displays MODJI community road reports only and clearly omits traffic speeds. Consent-based aggregated mobile speed observations and provider credentials remain.
5. **Data foundation (partially implemented):** Prisma Postgres stores accounts, sessions, saved places, journey history and community reports. Distributed rate-limit support is coded for Upstash Redis; no Redis instance is connected. A PostGIS-compatible database is still required; Prisma Postgres does not supply PostGIS.
6. **Community and identity (web/native code implemented):** registration, login, revocable sessions, account deletion, saved places, journey history, anonymous expiring reports, duplicate checks and community votes. Password recovery mail, account verification, moderation, Fastify REST/OpenAPI/WebSockets and PostGIS spatial queries remain.
7. **Mobile and release (native app scaffold implemented):** Expo/React Native app includes MapLibre, search, routing, foreground GPS, speech, accounts and community reports. No native binary is available yet. EAS account/signing setup, Android APK build, Apple device/TestFlight distribution, background navigation and physical-device verification remain.

## Architecture direction

Begin with a TypeScript workspace and a modular backend. Keep search, map style, routing, and traffic behind provider interfaces. Store user-generated locations and reports separately from licensed provider results. Apply spatial/temporal indexes once the PostGIS service is added. Treat coverage and freshness as data attached to results.

The current web milestone provides real routes, but the community Valhalla endpoint and Nominatim are low-volume development fallbacks only; they must not be treated as production services. Without a HERE key, only community reports are shown; MODJI does not synthesize provider traffic speeds.
