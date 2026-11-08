# Implementation roadmap

1. **Web map and discovery (implemented):** real MapLibre map, Nominatim real place search, browser location, responsive shell. Search categories, autocomplete, reverse geocoding, and HERE Search remain.
2. **Routing foundation (web path implemented):** Valhalla service for driving, walking and cycling; route alternatives, maneuvers and map geometry. Self-hosting and reproducible regional extracts remain.
3. **Navigation (web path implemented):** foreground browser GPS tracking, accuracy-aware off-route status, manual recalculation and browser voice guidance. Native background support and moving-device verification remain.
4. **Traffic (adapter implemented, credentials absent):** HERE Traffic API v7 flow and incidents with freshness metadata and map overlays. Live account-backed verification remains.
5. **Data foundation (partially implemented):** the Vercel Prisma Postgres database is connected and the web app creates its community-report tables on first API use. PostGIS, Redis, accounts and the wider spatial schema remain unconfigured.
6. **Community, identity, and API (web reports implemented):** anonymous expiring road reports, viewport queries, duplicate checks, per-browser rate limits and distinct community votes are live. Accounts, moderation tools, Fastify REST/OpenAPI/WebSockets and broader durable workflows remain.
7. **Mobile and release:** Expo native map, platform permissions, build pipeline, device verification, monitoring and deployment remain.

## Architecture direction

Begin with a TypeScript workspace and a modular backend. Keep search, map style, routing, and traffic behind provider interfaces. Store user-generated locations and reports separately from licensed provider results. Apply spatial/temporal indexes once the PostGIS service is added. Treat coverage and freshness as data attached to results.

The current web milestone provides real routes, but the community Valhalla endpoint and Nominatim are low-volume development fallbacks only; they must not be treated as production services. Traffic is explicitly unavailable unless a HERE key is configured.
