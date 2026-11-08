# Data sources and attribution

- **Map rendering:** MapLibre GL JS.
- **Map style/tiles:** OpenFreeMap Liberty style (`https://tiles.openfreemap.org/styles/liberty`). Review OpenFreeMap service and style terms before production deployment; this hosted endpoint is not an unlimited commercial SLA.
- **Underlying map data:** OpenStreetMap contributors. The rendered map includes provider attribution. OSM data is available under the ODbL; preserve required attribution and licensing.
- **Development geocoding:** OpenStreetMap Nominatim. Explicit user-submitted searches only; server-side cache and request spacing are implemented. Public Nominatim is not a general-purpose commercial autocomplete service. Configure a licensed production provider such as HERE.
- **Development routing:** Valhalla at `https://valhalla1.openstreetmap.de`. Routes are real road-network calculations, but this is a public community demo without a production SLA; do not use it as commercial infrastructure. Set `VALHALLA_URL` to a self-hosted or licensed provider for deployment.
- **Device location:** browser Geolocation API, requested only when the user starts location or navigation; active navigation uses foreground watch updates and clears the watch on stop/unmount.
- **Satellite imagery, terrain, traffic, routing:** not configured yet. Do not infer availability from the map display.

Coverage varies by region and provider. No global completeness or live traffic coverage is claimed.
