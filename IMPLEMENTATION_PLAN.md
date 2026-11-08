# Implementation roadmap

1. **Web map and discovery (implemented):** real MapLibre map, real place search, browser location, accessible responsive shell.
2. **Provider-backed search and data policy:** HERE adapter/configuration, search categories, reverse geocoding and coverage metadata.
3. **Routing foundation (web path implemented):** Valhalla service for driving, walking and cycling; route alternatives, maneuvers and map geometry. Self-hosting and reproducible regional extracts remain.
4. **Navigation (web path implemented):** GPS-aware foreground tracking, accuracy-aware off-route status, manual recalculation and browser voice guidance. Native background support and device verification remain.
5. **Traffic and community:** HERE traffic adapter, source/freshness attribution, validated and expiring incident reports.
6. **Accounts and platform operations:** PostgreSQL/PostGIS, Redis, API, security, privacy, and persistence.
7. **Mobile and release:** Expo native map, platform permissions, build pipeline, device verification, monitoring and deployment.

## Architecture direction

Begin with a TypeScript workspace and a modular backend. Keep search, map style, routing, and traffic behind provider interfaces. Store user-generated locations and reports separately from licensed provider results. Apply spatial/temporal indexes once the PostGIS service is added. Treat coverage and freshness as data attached to results.

The first web milestone deliberately avoids claiming route or traffic functionality. Nominatim is a low-volume development fallback only; it must not be treated as a production search backend.
