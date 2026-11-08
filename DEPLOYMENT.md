# Deployment

## Vercel web project

The production web project is connected to the public GitHub repository `riter675/modji` in the Vercel account. Its project root is `apps/web`, its framework is Next.js, and pushes to `main` trigger Vercel deployments. The live deployment URL is `https://modji-eight.vercel.app`.

No provider secrets are required to render the map, search places with the low-volume Nominatim development adapter, or calculate routes through the low-volume Valhalla development endpoint. Set these server-side Vercel environment variables before enabling the corresponding integrations:

- `HERE_TRAFFIC_API_KEY` enables the HERE Traffic API v7 adapter. Without it, the UI reports live traffic as unavailable.
- `VALHALLA_URL` selects a self-hosted or licensed Valhalla service instead of the public development endpoint.

Map styles currently use OpenFreeMap. Verify provider terms, regional coverage and capacity before commercial launch. This deployment is a working web milestone, not a production-scale global traffic service.

## Local production build

Requirements: Node.js 22+ and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

Do not run `pnpm build` concurrently with `pnpm dev` in the same checkout. For database scaffolding, see `DATABASE.md`; the PostGIS migration has not yet been executed in this environment.
