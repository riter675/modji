"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import maplibregl, { GeoJSONSource, Map, Marker } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { nearestRoutePoint, distanceMeters } from "../lib/route-matching";

type Place = { lat: string; lon: string; display_name: string; type?: string };
type Coordinate = { lat: number; lon: number };
type RouteOption = { distanceKm: number; durationSeconds: number; geometry: { type: "LineString"; coordinates: [number, number][] }; maneuvers: { instruction: string; distanceKm: number; durationSeconds: number; street: string; endShapeIndex: number }[] };
type TrafficCollection = { type: "FeatureCollection"; features: { type: "Feature"; properties: Record<string, string | number | boolean | null>; geometry: { type: "MultiLineString"; coordinates: [number, number][][] } }[] };
type TrafficData = { provider: string; updatedAt: { flow: string | null; incidents: string | null }; flow: TrafficCollection; incidents: TrafficCollection; counts: { flow: number; incidents: number } };
const mapStyles = { liberty: "https://tiles.openfreemap.org/styles/liberty", positron: "https://tiles.openfreemap.org/styles/positron", dark: "https://tiles.openfreemap.org/styles/dark" } as const;
type MapStyleName = keyof typeof mapStyles;
type CommunityReport = { id: string; category: string; latitude: number; longitude: number; description: string | null; status: string; validation_count: number };

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
  const [trafficData, setTrafficData] = useState<TrafficData | null>(null);
  const [trafficLoading, setTrafficLoading] = useState(false);
  const [trafficError, setTrafficError] = useState("");
  const [navigationStatus, setNavigationStatus] = useState<"idle" | "navigating" | "off-route" | "arrived">("idle");
  const [navigationPosition, setNavigationPosition] = useState<GeolocationPosition | null>(null);
  const [navigationError, setNavigationError] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [nextManeuver, setNextManeuver] = useState(0);
  const [communityOpen, setCommunityOpen] = useState(false);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [reportCategory, setReportCategory] = useState("hazard");
  const [reportDescription, setReportDescription] = useState("");
  const [communityMessage, setCommunityMessage] = useState("");
  const [communityBusy, setCommunityBusy] = useState(false);

  async function loadReports() {
    const bounds = map.current?.getBounds(); if (!bounds) return;
    const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(",");
    try { const response = await fetch(`/api/community/reports?bbox=${encodeURIComponent(bbox)}`); const data = await response.json() as { reports?: CommunityReport[]; error?: string }; if (!response.ok) throw new Error(data.error); setReports(data.reports ?? []); setCommunityMessage(""); }
    catch (cause) { setCommunityMessage(cause instanceof Error ? cause.message : "Community reports are unavailable."); }
  }

  async function submitReport() {
    const center = map.current?.getCenter(); if (!center) return;
    setCommunityBusy(true); setCommunityMessage("");
    try { const response = await fetch("/api/community/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ latitude: center.lat, longitude: center.lng, category: reportCategory, description: reportDescription }) }); const data = await response.json() as { report?: CommunityReport; error?: string }; if (!response.ok) throw new Error(data.error); setReportDescription(""); setCommunityMessage("Report submitted. Thanks for helping other travelers."); await loadReports(); }
    catch (cause) { setCommunityMessage(cause instanceof Error ? cause.message : "Report could not be submitted."); }
    finally { setCommunityBusy(false); }
  }

  async function voteReport(id: string, vote: "confirm" | "resolved" | "incorrect") {
    try { const response = await fetch(`/api/community/reports/${id}/votes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vote }) }); const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error); await loadReports(); }
    catch (cause) { setCommunityMessage(cause instanceof Error ? cause.message : "Vote could not be submitted."); }
  }

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
      void loadReports();
    });
    instance.on("moveend", () => { void loadReports(); });
    const resizeObserver = new ResizeObserver(() => instance.resize());
    resizeObserver.observe(mapElement.current);
    requestAnimationFrame(() => instance.resize());
    instance.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
    instance.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    map.current = instance;
    return () => { window.clearTimeout(loadTimeout); resizeObserver.disconnect(); if (watchId.current !== null) navigator.geolocation?.clearWatch(watchId.current); marker.current?.remove(); gpsMarker.current?.remove(); instance.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !mapLoaded) return;
    const data = { type: "FeatureCollection" as const, features: reports.map((report) => ({ type: "Feature" as const, properties: { id: report.id, category: report.category, status: report.status, count: report.validation_count }, geometry: { type: "Point" as const, coordinates: [report.longitude, report.latitude] as [number, number] } })) };
    const source = instance.getSource("modji-community-reports") as GeoJSONSource | undefined;
    if (source) source.setData(data);
    else {
      instance.addSource("modji-community-reports", { type: "geojson", data });
      instance.addLayer({ id: "modji-community-report-points", type: "circle", source: "modji-community-reports", paint: { "circle-radius": 8, "circle-color": "#b44231", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
    }
  }, [reports, mapLoaded]);

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

  function clearTraffic() {
    const instance = map.current;
    if (!instance) return;
    ["modji-traffic-incidents", "modji-traffic-flow"].forEach((id) => { if (instance.getLayer(id)) instance.removeLayer(id); });
    ["modji-traffic-incidents", "modji-traffic-flow"].forEach((id) => { if (instance.getSource(id)) instance.removeSource(id); });
  }

  function drawTraffic(data: TrafficData) {
    const instance = map.current;
    if (!instance || !mapLoaded) return;
    const flowSource = instance.getSource("modji-traffic-flow") as GeoJSONSource | undefined;
    if (flowSource) flowSource.setData(data.flow as FeatureCollection);
    else {
      instance.addSource("modji-traffic-flow", { type: "geojson", data: data.flow as FeatureCollection });
      instance.addLayer({ id: "modji-traffic-flow", type: "line", source: "modji-traffic-flow", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": ["interpolate", ["linear"], ["get", "jamFactor"], 0, "#48a977", 2, "#e0b545", 5, "#e47c32", 8, "#d94736", 10, "#82251f"], "line-width": 4, "line-opacity": 0.88 } });
    }
    const incidentSource = instance.getSource("modji-traffic-incidents") as GeoJSONSource | undefined;
    if (incidentSource) incidentSource.setData(data.incidents as FeatureCollection);
    else {
      instance.addSource("modji-traffic-incidents", { type: "geojson", data: data.incidents as FeatureCollection });
      instance.addLayer({ id: "modji-traffic-incidents", type: "line", source: "modji-traffic-incidents", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": ["case", ["==", ["get", "roadClosed"], true], "#8b1f27", "#a043b7"], "line-width": 5, "line-dasharray": [1.5, 1] } });
    }
  }

  async function loadTraffic() {
    const bounds = map.current?.getBounds();
    if (!bounds) { setTrafficError("The map is not ready yet."); return; }
    setTrafficLoading(true); setTrafficError("");
    const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].map((value) => value.toFixed(6)).join(",");
    try {
      const response = await fetch(`/api/traffic?bbox=${encodeURIComponent(bbox)}`);
      const payload = await response.json() as TrafficData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Live traffic is unavailable.");
      setTrafficData(payload);
      drawTraffic(payload);
    } catch (cause) {
      setTrafficError(cause instanceof Error ? cause.message : "Live traffic is unavailable.");
    } finally { setTrafficLoading(false); }
  }

  function toggleTraffic() {
    if (trafficOpen) { setTrafficOpen(false); clearTraffic(); }
    else { setTrafficOpen(true); void loadTraffic(); }
  }

  function changeMapStyle(value: MapStyleName) {
    setMapStyle(value);
    const instance = map.current;
    if (!instance) return;
    instance.setStyle(mapStyles[value]);
    instance.once("style.load", () => {
      const route = routeChoices[activeRoute];
      if (route) drawRoute(route);
      if (trafficOpen && trafficData) drawTraffic(trafficData);
      const source = map.current?.getSource("modji-community-reports") as GeoJSONSource | undefined;
      if (source) source.setData({ type: "FeatureCollection", features: reports.map((report) => ({ type: "Feature" as const, properties: { id: report.id }, geometry: { type: "Point" as const, coordinates: [report.longitude, report.latitude] as [number, number] } })) });
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
      <nav aria-label="Main navigation"><a className="active" href="#explore">Explore</a><a href="#navigate" onClick={(event) => { event.preventDefault(); if (place) setRoutePanelOpen(true); else setError("Search for a destination first to plan a route."); }}>Navigate</a><a href="#traffic" onClick={(event) => { event.preventDefault(); toggleTraffic(); }}>Traffic</a><a href="#community" onClick={(event) => { event.preventDefault(); setCommunityOpen(!communityOpen); void loadReports(); }}>Community</a></nav>
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
      {trafficOpen && <div className="traffic-message" role="status"><b>{trafficLoading ? "Loading live traffic…" : trafficError ? "Live traffic unavailable" : "Live traffic"}</b><span>{trafficError || (trafficData ? `${trafficData.counts.flow} flow segments · ${trafficData.counts.incidents} incidents` : "Waiting for traffic data.")}</span>{trafficData && <span>Flow updated: {trafficData.updatedAt.flow ?? "time unavailable"} · Incidents updated: {trafficData.updatedAt.incidents ?? "time unavailable"}</span>}</div>}
      {communityOpen && <section className="community-panel" aria-label="Community reports"><div className="place-label">COMMUNITY ROAD REPORTS</div><p>Reports use the map center ({map.current?.getCenter().lat.toFixed(4)}, {map.current?.getCenter().lng.toFixed(4)}). Active reports expire after two hours.</p><select aria-label="Report category" value={reportCategory} onChange={(event) => setReportCategory(event.target.value)}><option value="accident">Accident</option><option value="congestion">Congestion</option><option value="slow_traffic">Slow traffic</option><option value="roadworks">Roadworks</option><option value="road_closure">Road closure</option><option value="hazard">Hazard</option><option value="object_on_road">Object on road</option><option value="vehicle_breakdown">Vehicle breakdown</option><option value="other">Other</option></select><input maxLength={500} placeholder="Short description (optional)" value={reportDescription} onChange={(event) => setReportDescription(event.target.value)} /><button className="route-submit" disabled={communityBusy} onClick={() => void submitReport()}>{communityBusy ? "Submitting…" : "Report at map center"}</button>{communityMessage && <div className="community-note" role="status">{communityMessage}</div>}<div className="report-list">{reports.map((report) => <article key={report.id}><b>{report.category.replaceAll("_", " ")}</b><span>{report.description || "Community reported"} · {report.status}</span><div><button onClick={() => void voteReport(report.id,"confirm")}>Confirm</button><button onClick={() => void voteReport(report.id,"resolved")}>Resolved</button><button onClick={() => void voteReport(report.id,"incorrect")}>Incorrect</button></div></article>)}{reports.length === 0 && <span>No active reports in this view.</span>}</div></section>}
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
