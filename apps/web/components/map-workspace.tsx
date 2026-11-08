"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import maplibregl, { GeoJSONSource, Map, Marker } from "maplibre-gl";
import { nearestRoutePoint, distanceMeters } from "../lib/route-matching";

type Place = { lat: string; lon: string; display_name: string; type?: string };
type Coordinate = { lat: number; lon: number };
type RouteOption = { distanceKm: number; durationSeconds: number; geometry: { type: "LineString"; coordinates: [number, number][] }; maneuvers: { instruction: string; distanceKm: number; durationSeconds: number; street: string; endShapeIndex: number }[] };
const mapStyles = { liberty: "https://tiles.openfreemap.org/styles/liberty", positron: "https://tiles.openfreemap.org/styles/positron", dark: "https://tiles.openfreemap.org/styles/dark" } as const;
type MapStyleName = keyof typeof mapStyles;

export default function MapWorkspace() {
  const mapElement = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const marker = useRef<Marker | null>(null);
  const gpsMarker = useRef<Marker | null>(null);
  const watchId = useRef<number | null>(null);
  const offRouteCount = useRef(0);
  const lastManeuver = useRef(-1);
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState<Place | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mapError, setMapError] = useState("");
  const [mapLoaded, setMapLoaded] = useState(false);
  const [origin, setOrigin] = useState<Coordinate | null>(null);
  const [originQuery, setOriginQuery] = useState("");
  const [costing, setCosting] = useState<"auto" | "pedestrian" | "bicycle">("auto");
  const [routeChoices, setRouteChoices] = useState<RouteOption[]>([]);
  const [activeRoute, setActiveRoute] = useState(0);
  const [routePanelOpen, setRoutePanelOpen] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [mapStyle, setMapStyle] = useState<MapStyleName>("liberty");
  const [trafficOpen, setTrafficOpen] = useState(false);
  const [navigationStatus, setNavigationStatus] = useState<"idle" | "navigating" | "off-route" | "arrived">("idle");
  const [navigationPosition, setNavigationPosition] = useState<GeolocationPosition | null>(null);
  const [navigationError, setNavigationError] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [nextManeuver, setNextManeuver] = useState(0);

  useEffect(() => {
    if (!mapElement.current || map.current) return;
    const instance = new maplibregl.Map({
      container: mapElement.current,
      style: mapStyles.liberty,
      center: [2.3522, 48.8566],
      zoom: 12,
      pitch: 0,
      attributionControl: false,
    });
    const loadTimeout = window.setTimeout(() => {
      setMapError("Map tiles are taking too long. Check the tile provider connection and retry.");
    }, 15000);
    instance.on("error", (event) => {
      console.error("MODJI map provider error", event.error);
      window.clearTimeout(loadTimeout);
      setMapError(event.error?.message || "Map tiles could not be loaded.");
    });
    instance.once("load", () => {
      window.clearTimeout(loadTimeout);
      setMapLoaded(true);
      setMapError("");
    });
    const resizeObserver = new ResizeObserver(() => instance.resize());
    resizeObserver.observe(mapElement.current);
    requestAnimationFrame(() => instance.resize());
    instance.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
    instance.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    map.current = instance;
    return () => { window.clearTimeout(loadTimeout); resizeObserver.disconnect(); if (watchId.current !== null) navigator.geolocation?.clearWatch(watchId.current); marker.current?.remove(); gpsMarker.current?.remove(); instance.remove(); map.current = null; };
  }, []);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim();
    if (!term || loading) return;
    setLoading(true); setError(""); setPlace(null);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
      const payload = await response.json() as { results?: Place[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Search is temporarily unavailable.");
      const result = payload.results?.[0];
      if (!result) { setError("No matching places found. Try a nearby city or landmark."); return; }
      setPlace(result);
      const coordinates: [number, number] = [Number(result.lon), Number(result.lat)];
      map.current?.flyTo({ center: coordinates, zoom: 15, speed: 1.25, essential: true });
      marker.current?.remove();
      marker.current = new maplibregl.Marker({ color: "#d94a36" }).setLngLat(coordinates).addTo(map.current!);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Search is temporarily unavailable.");
    } finally { setLoading(false); }
  }

  function locate() {
    setError("");
    if (!navigator.geolocation) { setError("Location is not available in this browser."); return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const center: [number, number] = [coords.longitude, coords.latitude];
        map.current?.flyTo({ center, zoom: 16, essential: true });
        marker.current?.remove();
        marker.current = new maplibregl.Marker({ color: "#243d36" }).setLngLat(center).addTo(map.current!);
        setPlace({ lat: String(coords.latitude), lon: String(coords.longitude), display_name: "Your current location" });
      },
      () => setError("Location permission was denied or your position is unavailable."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 },
    );
  }

  function drawRoute(route: RouteOption) {
    if (!map.current || !mapLoaded) return;
    const source = map.current.getSource("modji-route") as GeoJSONSource | undefined;
    const data = { type: "Feature" as const, properties: {}, geometry: route.geometry };
    if (source) source.setData(data);
    else {
      map.current.addSource("modji-route", { type: "geojson", data });
      map.current.addLayer({ id: "modji-route-line", type: "line", source: "modji-route", paint: { "line-color": "#d94a36", "line-width": 5, "line-opacity": 0.92 } });
    }
    const bounds = new maplibregl.LngLatBounds();
    route.geometry.coordinates.forEach((coordinate) => bounds.extend(coordinate));
    const mobile = window.matchMedia("(max-width: 700px)").matches;
    map.current.fitBounds(bounds, { padding: { top: 110, right: 45, bottom: mobile ? 460 : 70, left: mobile ? 45 : 430 }, maxZoom: 15, duration: 900 });
  }

  function changeMapStyle(value: MapStyleName) {
    setMapStyle(value);
    const instance = map.current;
    if (!instance) return;
    instance.setStyle(mapStyles[value]);
    instance.once("style.load", () => {
      const route = routeChoices[activeRoute];
      if (route) drawRoute(route);
    });
  }

  function stopNavigation() {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    offRouteCount.current = 0;
    lastManeuver.current = -1;
    setNavigationStatus("idle");
    setNavigationPosition(null);
    gpsMarker.current?.remove();
    gpsMarker.current = null;
    window.speechSynthesis?.cancel();
  }

  function startNavigation() {
    const route = routeChoices[activeRoute];
    if (!route || !place) return;
    setNavigationError("");
    if (!navigator.geolocation) { setNavigationError("GPS is not available in this browser."); return; }
    stopNavigation();
    offRouteCount.current = 0;
    const speak = (message: string) => {
      if (!voiceEnabled || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(message));
    };
    speak("Navigation started.");
    watchId.current = navigator.geolocation.watchPosition((position) => {
      setNavigationPosition(position);
      const current: [number, number] = [position.coords.longitude, position.coords.latitude];
      map.current?.easeTo({ center: current, zoom: 17, duration: 450 });
      if (!gpsMarker.current && map.current) gpsMarker.current = new maplibregl.Marker({ color: "#243d36" }).setLngLat(current).addTo(map.current);
      else gpsMarker.current?.setLngLat(current);
      const nearest = nearestRoutePoint(current, route.geometry.coordinates);
      const tolerance = Math.max(70, (position.coords.accuracy || 0) * 2);
      if (nearest.distanceMeters > tolerance) offRouteCount.current += 1;
      else offRouteCount.current = 0;
      const destination: [number, number] = [Number(place.lon), Number(place.lat)];
      const remaining = distanceMeters(current, destination);
      if (remaining <= Math.max(45, position.coords.accuracy || 0)) {
        setNavigationStatus("arrived");
        speak("You have arrived.");
        if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
        return;
      }
      if (offRouteCount.current >= 3) setNavigationStatus("off-route");
      else setNavigationStatus("navigating");
      const maneuverIndex = route.maneuvers.findIndex((maneuver) => maneuver.endShapeIndex > nearest.index);
      if (maneuverIndex >= 0) {
        setNextManeuver(maneuverIndex);
        if (maneuverIndex !== lastManeuver.current) speak(route.maneuvers[maneuverIndex].instruction);
        lastManeuver.current = maneuverIndex;
      }
    }, (cause) => setNavigationError(cause.message || "GPS position is unavailable."), { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 });
  }

  async function useCurrentOrigin() {
    setRouteError("");
    if (!navigator.geolocation) { setRouteError("Location is not available in this browser."); return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setOrigin({ lat: coords.latitude, lon: coords.longitude }); setOriginQuery("Current location"); },
      () => setRouteError("Location permission was denied or your position is unavailable."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 },
    );
  }

  async function calculateRoute(startingOrigin?: Coordinate) {
    if (!place || routeLoading) return;
    setRouteLoading(true); setRouteError("");
    try {
      let routeOrigin = startingOrigin ?? origin;
      if (!routeOrigin) {
        if (!originQuery.trim()) throw new Error("Enter a starting place or use your current location.");
        const geocodeResponse = await fetch(`/api/search?q=${encodeURIComponent(originQuery.trim())}`);
        const geocoded = await geocodeResponse.json() as { results?: Place[]; error?: string };
        if (!geocodeResponse.ok || !geocoded.results?.[0]) throw new Error(geocoded.error || "The starting place could not be found.");
        routeOrigin = { lat: Number(geocoded.results[0].lat), lon: Number(geocoded.results[0].lon) };
      }
      const response = await fetch("/api/routes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: routeOrigin, destination: { lat: Number(place.lat), lon: Number(place.lon) }, costing }),
      });
      const payload = await response.json() as { route?: RouteOption; alternatives?: RouteOption[]; error?: string };
      if (!response.ok || !payload.route) throw new Error(payload.error || "Route calculation failed.");
      const choices = [payload.route, ...(payload.alternatives ?? [])];
      setOrigin(routeOrigin); setRouteChoices(choices); setActiveRoute(0); drawRoute(choices[0]);
    } catch (cause) {
      setRouteError(cause instanceof Error ? cause.message : "Route calculation failed.");
    } finally { setRouteLoading(false); }
  }

  return <main className="workspace">
    <div className="map" ref={mapElement} aria-label="Interactive world map" />
    {mapError && <div className="map-error" role="status">Map provider unavailable: {mapError}</div>}
    {!mapLoaded && !mapError && <div className="map-error" role="status">Loading map…</div>}
    <header className="topbar">
      <Link className="brand" href="/" aria-label="MODJI home"><Image src="/modji-logo-original.jpeg" alt="MODJI" width={38} height={38} priority /><span>MODJI</span></Link>
      <span className="tagline">Navigate your world.</span>
      <nav aria-label="Main navigation"><a className="active" href="#explore">Explore</a><a href="#navigate" onClick={(event) => { event.preventDefault(); if (place) setRoutePanelOpen(true); else setError("Search for a destination first to plan a route."); }}>Navigate</a><a href="#traffic" onClick={(event) => { event.preventDefault(); setTrafficOpen(!trafficOpen); }}>Traffic</a></nav>
      <button className="avatar" aria-label="Accounts are not implemented yet" disabled title="Accounts are not implemented yet">M</button>
    </header>
    <section className="search-panel" aria-label="Explore the map">
      <div className="eyebrow"><span className="live-dot" /> WORLD EXPLORER</div>
      <h1>Where to?</h1>
      <p className="intro">Find a place and start exploring.</p>
      <form onSubmit={search} className="search-form">
        <span aria-hidden="true" className="search-icon">⌕</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a place or address" aria-label="Search a place or address" />
        <button aria-label="Submit search" disabled={loading || !query.trim()}>{loading ? "…" : "↵"}</button>
      </form>
      <p className="search-hint">Search cities, landmarks, addresses and more</p>
      <button className="location-button" onClick={locate}><span>◎</span> Use my location</button>
      {error && <div className="message error" role="alert">{error}</div>}
      {trafficOpen && <div className="traffic-message" role="status"><b>Live traffic unavailable</b><span>Traffic data is not connected yet. Route times are static estimates.</span></div>}
      {place && <article className="place-card" aria-live="polite"><div className="place-pin">●</div><div className="place-content"><div className="place-label">{place.type ? place.type.replaceAll("_", " ") : "PLACE"}</div><h2>{place.display_name}</h2><p>{Number(place.lat).toFixed(5)}° · {Number(place.lon).toFixed(5)}°</p><button className="route-open" onClick={() => setRoutePanelOpen(!routePanelOpen)}>{routePanelOpen ? "Close route planner" : "Plan a route"}</button></div></article>}
      {place && routePanelOpen && <section className="route-panel" aria-label="Route planner">
        <div className="place-label">ROUTE PLANNER</div>
        <div className="origin-row"><input aria-label="Starting point" placeholder="Starting point or address" value={originQuery} onChange={(event) => { setOriginQuery(event.target.value); setOrigin(null); }} /><button onClick={useCurrentOrigin} aria-label="Use current location as route origin">◎</button></div>
        {origin && <p className="origin-status">Origin set to {originQuery || `${origin.lat.toFixed(4)}, ${origin.lon.toFixed(4)}`}</p>}
        <select aria-label="Travel mode" value={costing} onChange={(event) => setCosting(event.target.value as typeof costing)}><option value="auto">Driving</option><option value="pedestrian">Walking</option><option value="bicycle">Cycling</option></select>
        <button className="route-submit" onClick={() => void calculateRoute()} disabled={routeLoading}>{routeLoading ? "Calculating…" : "Calculate route"}</button>
        {routeError && <div className="message error" role="alert">{routeError}</div>}
        {routeChoices.length > 0 && <div className="route-results">
          <div className="route-tabs">{routeChoices.map((route, index) => <button key={`${index}-${route.distanceKm}`} className={activeRoute === index ? "selected" : ""} onClick={() => { if (navigationStatus !== "idle") stopNavigation(); setActiveRoute(index); drawRoute(route); }}><b>{index === 0 ? "Recommended" : `Option ${index + 1}`}</b><span>{route.distanceKm.toFixed(1)} km · {Math.round(route.durationSeconds / 60)} min</span></button>)}</div>
          <div className="route-summary">Static route estimate · live traffic not included</div>
          <ol>{routeChoices[activeRoute]?.maneuvers.slice(0, 5).map((item, index) => <li key={`${index}-${item.instruction}`}>{item.instruction}</li>)}</ol>
          <label className="voice-toggle"><input type="checkbox" checked={voiceEnabled} disabled={navigationStatus !== "idle"} onChange={(event) => setVoiceEnabled(event.target.checked)} /> Voice guidance</label>
          {navigationStatus === "idle" ? <button className="route-submit" onClick={startNavigation}>Start GPS navigation</button> : <div className="navigation-status" role="status">
            <b>{navigationStatus === "off-route" ? "Off route" : navigationStatus === "arrived" ? "Arrived" : "Navigation active"}</b>
            {navigationPosition && <span>Accuracy ±{Math.round(navigationPosition.coords.accuracy)} m{navigationPosition.coords.accuracy > 50 ? " · GPS signal weak" : ""}{navigationPosition.coords.speed !== null ? ` · ${Math.round(navigationPosition.coords.speed * 3.6)} km/h` : ""}</span>}
            {routeChoices[activeRoute]?.maneuvers[nextManeuver] && <span>{routeChoices[activeRoute].maneuvers[nextManeuver].instruction}</span>}
            {navigationStatus === "off-route" && navigationPosition && <button className="route-submit" onClick={() => { const current = { lat: navigationPosition.coords.latitude, lon: navigationPosition.coords.longitude }; setOrigin(current); setOriginQuery("Current location"); stopNavigation(); void calculateRoute(current); }}>Recalculate from here</button>}
            <button className="route-stop" onClick={stopNavigation}>Stop navigation</button>
          </div>}
          {navigationError && <div className="message error" role="alert">{navigationError}</div>}
        </div>}
      </section>}
      <div className="panel-footer"><span>Map data © OpenStreetMap</span><span>Search by Nominatim</span></div>
    </section>
    <label className="layers-control"><span aria-hidden="true">▧</span><select className="layers-button" aria-label="Map style" value={mapStyle} onChange={(event) => changeMapStyle(event.target.value as MapStyleName)}><option value="liberty">Standard</option><option value="positron">Light</option><option value="dark">Dark</option></select></label>
    <div className="map-caption"><span>48°51′24″N</span><span>2°21′08″E</span></div>
  </main>;
}
