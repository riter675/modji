# Provider configuration

## Map

The web app currently uses MapLibre GL JS with OpenFreeMap styles and OpenStreetMap-derived map data. Attribution is shown in the map. Confirm upstream style and data terms, availability, and capacity before a commercial launch. Satellite imagery is not configured.

## Search

The current search adapter uses Nominatim for explicit user-submitted queries. It has request spacing, caching, timeout and error handling. This is a low-volume development fallback; it does not implement HERE Search, autocomplete, business categories or reverse geocoding. Do not point production traffic at the public Nominatim service.

## Routing

The web app calls the Valhalla-compatible endpoint configured by `VALHALLA_URL`. If unset, it uses the documented low-volume public development endpoint. A production deployment must provide an appropriately operated/licensed endpoint and geographic data extracts.

## Traffic

Set `HERE_TRAFFIC_API_KEY` in the server environment to enable HERE Traffic API v7. The key is never sent to the browser. Without it, the API returns an explicit unavailable response and the UI displays that traffic is not configured. Live account-backed behavior and regional coverage have not been verified in this workspace.

## Local values

See `.env.example` for variable names and safe local placeholders. Keep real credentials in an ignored `.env` file for local development or a secret manager in deployed environments. Never commit secrets.
