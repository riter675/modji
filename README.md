# MODJI

**Navigate your world.**

MODJI is an independent mapping and mobility product. The current web milestone includes a real MapLibre map, real place search, browser positioning and road route calculation through Valhalla.

## Run locally

Requirements: Node.js 22+ and pnpm 11.25.0.

```sh
pnpm install
pnpm dev
```

Open the local URL printed by Next.js. The map style is hosted by OpenFreeMap and map data is OpenStreetMap. Search submits an explicit query to the OpenStreetMap Nominatim service; it is not autocomplete. The public service has a strict usage policy and is suitable only for low volume development, not production commercial traffic. Replace it with an appropriately licensed HERE Search adapter before production. Browser location requires permission and a secure context (HTTPS or localhost).

Quality checks: `pnpm lint`, `pnpm typecheck`, and `pnpm test`. To serve an optimized build, run `pnpm build` and then `pnpm start` (do not run the production build concurrently with the dev server).

The current web app is deployed at [modji-eight.vercel.app](https://modji-eight.vercel.app) from GitHub `main`. See [DEPLOYMENT.md](DEPLOYMENT.md) for configuration and production limitations.

## Current milestone

- Interactive global map via MapLibre and OpenFreeMap Liberty style.
- Real place search via Nominatim, server-side request, timeout, caching and one request per second per process.
- Real browser geolocation, subject to device/browser permission.
- Valhalla driving, walking and cycling route API, road geometry, maneuver instructions and up to two alternatives.
- Foreground GPS tracking during an explicitly started web navigation session, location accuracy display, off-route detection and browser voice guidance. Background navigation is not included.
- Anonymous community road reports with persisted coordinates, categories, descriptions, expiry and community votes through the connected Prisma Postgres database. Reports are placed at the current map center; browser identities are anonymous.
- Email/password accounts with hashed passwords, revocable 30-day sessions, secure browser cookies, encrypted mobile token storage, profile mode, saved places, journey history and account deletion. Password-reset email remains unavailable until an email sender is configured.
- Expo/React Native app for Android and iOS using native MapLibre. It has place search, Valhalla routes, foreground GPS and speech instructions. Native installation builds use Expo EAS; this workspace has no Android toolchain, EAS account or Apple signing credentials, so no APK/IPA binary has been produced yet.
- Traffic without HERE credentials falls back to real MODJI community reports and labels itself clearly; it does not show fabricated road speeds or provider flow.
- Credential-gated HERE Traffic API v7 adapter for flow and incidents, freshness timestamps, and map overlays. Add `HERE_TRAFFIC_API_KEY` to the server environment to enable it.
- Route durations are static estimates. The community Valhalla demo is the default for low-volume development only; set `VALHALLA_URL` to a self-hosted or licensed deployment before production.
- Original MODJI image supplied by the user, preserved at `assets/branding/modji-logo-original.jpeg`.

Background mobile navigation, password-reset email, the full Fastify/WebSocket backend, Redis deployment and the full spatial schema remain. The connected Prisma Postgres service does not support PostGIS; it stores current report and account coordinates as numeric latitude/longitude. HERE traffic is not configured. Web and mobile GPS require real-device permission; mobile navigation has not been verified while moving. See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), [DATA_SOURCES.md](DATA_SOURCES.md), and [DATABASE.md](DATABASE.md).
