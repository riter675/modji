import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import Constants from "expo-constants";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import * as SecureStore from "expo-secure-store";
import { Camera, GeoJSONSource, Layer, Map as NativeMap } from "@maplibre/maplibre-react-native";
import type { FeatureCollection, LineString } from "geojson";

const API = (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? "https://modji-eight.vercel.app";
const STYLE = "https://tiles.openfreemap.org/styles/liberty";
type Point = { lat: number; lon: number };
type Place = { lat: string; lon: string; display_name: string };
type Route = { geometry: LineString; distanceKm: number; durationSeconds: number; maneuvers: { instruction: string; endShapeIndex: number; distanceKm: number }[] };
type Report = { id: string; category: string; latitude: number; longitude: number; description: string | null; status: string; validation_count: number };
type Account = { id: string; email: string; display_name: string; preferred_mode: "auto" | "pedestrian" | "bicycle"; locale: string };
type SavedPlace = { id: string; label: string; address: string | null; latitude: number; longitude: number };
type JourneyHistory = { id: string; origin_label: string | null; destination_label: string | null; transport_mode: string; distance_meters: number | null; duration_seconds: number | null };

export default function App() {
  const camera = useRef<React.ElementRef<typeof Camera>>(null);
  const locationWatch = useRef<Location.LocationSubscription | null>(null);
  const offRouteReadings = useRef(0);
  const spokenManeuver = useRef(-1);
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState<Place | null>(null);
  const [origin, setOrigin] = useState<Point | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [position, setPosition] = useState<Point | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"auto" | "pedestrian" | "bicycle">("auto");
  const [communityOpen, setCommunityOpen] = useState(false);
  const [category, setCategory] = useState("hazard");
  const [description, setDescription] = useState("");
  const [navigation, setNavigation] = useState<"idle" | "navigating" | "off-route" | "arrived">("idle");
  const [maneuverIndex, setManeuverIndex] = useState(0);
  const [account, setAccount] = useState<Account | null>(null);
  const [sessionToken, setSessionToken] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [profileName, setProfileName] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [journeyHistory, setJourneyHistory] = useState<JourneyHistory[]>([]);

  const routeData = useMemo<FeatureCollection<LineString>>(() => ({ type: "FeatureCollection", features: route ? [{ type: "Feature", properties: {}, geometry: route.geometry }] : [] }), [route]);
  const reportData = useMemo<FeatureCollection>(() => ({ type: "FeatureCollection", features: reports.map((report) => ({ type: "Feature", properties: { id: report.id, category: report.category }, geometry: { type: "Point", coordinates: [report.longitude, report.latitude] } })) }), [reports]);

  useEffect(() => { void loadReports({ lat: 48.8566, lon: 2.3522 }); }, []);
  useEffect(() => () => { locationWatch.current?.remove(); Speech.stop(); }, []);
  useEffect(() => { void (async () => { const token = await SecureStore.getItemAsync("modji-session"); if (!token) return; setSessionToken(token); try { const response = await fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } }); const data = await response.json() as { account?: Account }; if (data.account) { setAccount(data.account); setProfileName(data.account.display_name); } else { await SecureStore.deleteItemAsync("modji-session"); setSessionToken(""); } } catch { setAuthMessage("Could not restore your session. Check your connection."); } })(); }, []);
  useEffect(() => { if (!account) { setSavedPlaces([]); setJourneyHistory([]); return; } void Promise.all([apiFetch("/api/favorites").then((r) => r.json()), apiFetch("/api/journeys").then((r) => r.json())]).then(([places, journeys]) => { setSavedPlaces(places.places ?? []); setJourneyHistory(journeys.journeys ?? []); }).catch(() => undefined); }, [account, sessionToken]);

  async function apiFetch(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers); if (sessionToken) headers.set("Authorization", `Bearer ${sessionToken}`); return fetch(`${API}${path}`, { ...init, headers });
  }

  async function loadReports(center: Point) {
    const bbox = `${center.lon - 0.12},${center.lat - 0.08},${center.lon + 0.12},${center.lat + 0.08}`;
    try {
      const response = await fetch(`${API}/api/community/reports?bbox=${encodeURIComponent(bbox)}`);
      const data = await response.json() as { reports?: Report[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Community reports unavailable.");
      setReports(data.reports ?? []);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Community reports unavailable."); }
  }

  async function findPlace() {
    if (!query.trim() || busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`${API}/api/search?q=${encodeURIComponent(query.trim())}`);
      const data = await response.json() as { results?: Place[]; error?: string };
      if (!response.ok || !data.results?.[0]) throw new Error(data.error || "No matching places found.");
      const selected = data.results[0]; setPlace(selected); setRoute(null);
      camera.current?.flyTo({ center: [Number(selected.lon), Number(selected.lat)], zoom: 15, duration: 900 });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Search unavailable."); }
    finally { setBusy(false); }
  }

  async function locate() {
    setMessage("");
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") { setMessage("Location permission is needed to center the map on you."); return; }
    try {
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const point = { lat: current.coords.latitude, lon: current.coords.longitude };
      setPosition(point); setOrigin(point);
      camera.current?.flyTo({ center: [point.lon, point.lat], zoom: 16, duration: 800 });
      await loadReports(point);
    } catch { setMessage("Your location is not available right now."); }
  }

  async function calculateRoute() {
    if (!place) return;
    setBusy(true); setMessage("");
    try {
      let start = origin;
      if (!start) {
        throw new Error("Use your location to choose a route starting point first.");
      }
      const response = await fetch(`${API}/api/routes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ origin: start, destination: { lat: Number(place.lat), lon: Number(place.lon) }, costing: mode }) });
      const data = await response.json() as { route?: Route; error?: string };
      if (!response.ok || !data.route) throw new Error(data.error || "No route found.");
      setOrigin(start); setRoute(data.route);
      if (account) { await apiFetch("/api/journeys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ originLabel: "Current location", destinationLabel: place.display_name, origin: start, destination: { lat: Number(place.lat), lon: Number(place.lon) }, mode, distanceMeters: data.route.distanceKm * 1000, durationSeconds: data.route.durationSeconds }) }); const history = await (await apiFetch("/api/journeys")).json() as { journeys?: JourneyHistory[] }; setJourneyHistory(history.journeys ?? []); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Route calculation failed."); }
    finally { setBusy(false); }
  }

  async function submitReport() {
    const point = position ?? origin;
    if (!point) { setMessage("Use your location before submitting a report."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await apiFetch("/api/community/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ latitude: point.lat, longitude: point.lon, category, description }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Report could not be submitted.");
      setDescription(""); setMessage("Report sent. Thank you."); await loadReports(point);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Report could not be submitted."); }
    finally { setBusy(false); }
  }

  async function vote(id: string, value: "confirm" | "resolved" | "incorrect") {
    try {
      const response = await apiFetch(`/api/community/reports/${id}/votes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vote: value }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Vote could not be sent.");
      if (position) await loadReports(position);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Vote could not be sent."); }
  }

  function startVoiceGuidance() {
    if (!route) return;
    void (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") { setMessage("Location permission is required for navigation."); return; }
      locationWatch.current?.remove(); offRouteReadings.current = 0; spokenManeuver.current = -1;
      setNavigation("navigating"); setMessage("");
      try {
        locationWatch.current = await Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1500, distanceInterval: 4 }, (sample) => {
          const current = { lat: sample.coords.latitude, lon: sample.coords.longitude };
          setPosition(current); camera.current?.easeTo({ center: [current.lon, current.lat], zoom: 17, duration: 450 });
          const points = route.geometry.coordinates;
          let nearestIndex = 0; let nearestDistance = Number.POSITIVE_INFINITY;
          points.forEach(([lon, lat], index) => { const dLat = (lat - current.lat) * 111320; const dLon = (lon - current.lon) * 111320 * Math.cos(current.lat * Math.PI / 180); const distance = Math.hypot(dLat, dLon); if (distance < nearestDistance) { nearestDistance = distance; nearestIndex = index; } });
          if (nearestDistance > Math.max(70, (sample.coords.accuracy || 0) * 2)) offRouteReadings.current += 1; else offRouteReadings.current = 0;
          const [destLon, destLat] = points[points.length - 1];
          const toEnd = Math.hypot((destLat - current.lat) * 111320, (destLon - current.lon) * 111320 * Math.cos(current.lat * Math.PI / 180));
          if (toEnd <= Math.max(45, sample.coords.accuracy || 0)) { setNavigation("arrived"); Speech.speak("You have arrived."); locationWatch.current?.remove(); locationWatch.current = null; return; }
          const next = route.maneuvers.findIndex((step) => step.endShapeIndex > nearestIndex);
          if (next >= 0) { setManeuverIndex(next); if (spokenManeuver.current !== next) { spokenManeuver.current = next; Speech.speak(route.maneuvers[next].instruction, { language: "en-US" }); } }
          setNavigation(offRouteReadings.current >= 3 ? "off-route" : "navigating");
        });
      } catch { setNavigation("idle"); setMessage("GPS navigation could not start."); }
    })();
  }

  function stopNavigation() { locationWatch.current?.remove(); locationWatch.current = null; offRouteReadings.current = 0; spokenManeuver.current = -1; setNavigation("idle"); Speech.stop(); }

  async function authenticate() {
    setAuthMessage(""); setBusy(true);
    try {
      const endpoint = authMode === "login" ? "login" : "register";
      const response = await fetch(`${API}/api/auth/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json", "X-MODJI-Client": "native" }, body: JSON.stringify({ email: authEmail, password: authPassword, displayName }) });
      const data = await response.json() as { account?: Account; sessionToken?: string; error?: string };
      if (!response.ok || !data.account || !data.sessionToken) throw new Error(data.error || "Sign in failed.");
      await SecureStore.setItemAsync("modji-session", data.sessionToken); setSessionToken(data.sessionToken); setAccount(data.account); setProfileName(data.account.display_name); setAuthPassword(""); setAuthMessage("");
    } catch (error) { setAuthMessage(error instanceof Error ? error.message : "Sign in failed."); }
    finally { setBusy(false); }
  }

  async function signOut() {
    try { await apiFetch("/api/auth/logout", { method: "POST" }); } finally { await SecureStore.deleteItemAsync("modji-session"); setSessionToken(""); setAccount(null); setAccountOpen(false); }
  }

  async function saveDestination() {
    if (!place) return;
    const label = place.display_name.split(",")[0].trim().slice(0, 80) || "Saved place";
    const response = await apiFetch("/api/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label, address: place.display_name, latitude: Number(place.lat), longitude: Number(place.lon) }) });
    const data = await response.json() as { place?: SavedPlace; error?: string };
    if (!response.ok || !data.place) { setMessage(data.error || "Place could not be saved."); return; }
    setSavedPlaces((current) => [data.place!, ...current.filter((item) => item.id !== data.place!.id)]);
    setMessage("Destination saved to My MODJI.");
  }

  async function saveProfile() {
    try { const response = await apiFetch("/api/auth/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: profileName }) }); const data = await response.json() as { account?: Account; error?: string }; if (!response.ok || !data.account) throw new Error(data.error || "Profile could not be saved."); setAccount(data.account); setProfileName(data.account.display_name); setAuthMessage("Profile updated."); }
    catch (error) { setAuthMessage(error instanceof Error ? error.message : "Profile could not be saved."); }
  }

  function deleteAccount() {
    Alert.alert("Delete your MODJI account?", "This permanently deletes your profile, saved places and journey history.", [{ text: "Cancel", style: "cancel" }, { text: "Delete account", style: "destructive", onPress: () => { void (async () => { const response = await apiFetch("/api/auth/me", { method: "DELETE" }); if (!response.ok) { setAuthMessage("Account could not be deleted."); return; } await SecureStore.deleteItemAsync("modji-session"); setSessionToken(""); setAccount(null); setAccountOpen(false); })(); } }]);
  }

  return <View style={styles.screen}>
    <StatusBar barStyle="dark-content" />
    <NativeMap style={StyleSheet.absoluteFill} mapStyle={STYLE} attribution>
      <Camera ref={camera} initialViewState={{ center: [2.3522, 48.8566], zoom: 11 }} />
      {route && <GeoJSONSource id="modji-route" data={routeData}><Layer id="modji-route-line" type="line" paint={{ "line-color": "#d94a36", "line-width": 5, "line-opacity": 0.92 }} /></GeoJSONSource>}
      <GeoJSONSource id="modji-reports" data={reportData}><Layer id="modji-report-points" type="circle" paint={{ "circle-radius": 7, "circle-color": "#b44231", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 }} /></GeoJSONSource>
    </NativeMap>
    <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
      <View style={styles.topCard}>
        <View style={styles.brandRow}><Text style={styles.brand}>MODJI</Text><Text style={styles.tagline}>Navigate your world.</Text><Pressable style={styles.accountButton} onPress={() => setAccountOpen(true)}><Text style={styles.accountText}>{account ? (account.display_name || account.email.split("@")[0]) : "My MODJI"}</Text></Pressable><Pressable style={styles.locate} onPress={() => void locate()} accessibilityLabel="Use my location"><Text style={styles.locateText}>◎</Text></Pressable></View>
        <View style={styles.searchRow}><TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Place, address or landmark" returnKeyType="search" onSubmitEditing={() => void findPlace()} accessibilityLabel="Search places" /><Pressable style={styles.searchButton} onPress={() => void findPlace()} disabled={busy}><Text style={styles.searchButtonText}>{busy ? "…" : "Search"}</Text></Pressable></View>
        {message ? <Text style={styles.message} accessibilityRole="alert">{message}</Text> : null}
      </View>
      <View style={styles.bottomCard}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.bottomContent}>
          {place ? <><Text style={styles.eyebrow}>DESTINATION</Text><Text style={styles.placeName} numberOfLines={2}>{place.display_name}</Text>{account && <Pressable onPress={() => void saveDestination()} style={styles.secondary}><Text style={styles.secondaryText}>Save destination</Text></Pressable>}<View style={styles.modeRow}>{(["auto", "pedestrian", "bicycle"] as const).map((option) => <Pressable key={option} onPress={() => setMode(option)} style={[styles.modeChip, mode === option && styles.modeChipSelected]}><Text style={[styles.modeText, mode === option && styles.modeTextSelected]}>{option === "auto" ? "Drive" : option === "pedestrian" ? "Walk" : "Cycle"}</Text></Pressable>)}</View><Pressable onPress={() => void calculateRoute()} disabled={busy} style={styles.primary}><Text style={styles.primaryText}>{busy ? "Calculating…" : route ? "Recalculate route" : "Plan route"}</Text></Pressable></> : <><Text style={styles.eyebrow}>EXPLORE</Text><Text style={styles.prompt}>Where to?</Text></>}
          {route && <View style={styles.routeCard}><Text style={styles.routeMetric}>{route.distanceKm.toFixed(1)} km  ·  {Math.round(route.durationSeconds / 60)} min</Text><Text style={styles.routeNote}>Static estimate · live traffic not included</Text>{navigation === "idle" ? <Pressable style={styles.secondary} onPress={startVoiceGuidance}><Text style={styles.secondaryText}>Start GPS navigation</Text></Pressable> : <><Text style={styles.maneuver} numberOfLines={2}>{navigation === "arrived" ? "You have arrived." : route.maneuvers[maneuverIndex]?.instruction ?? "Follow the route"}</Text><Text style={styles.routeNote}>{navigation === "off-route" ? "Off route · move back to the route or stop navigation" : navigation === "arrived" ? "Navigation complete" : "GPS navigation active"}</Text><Pressable style={styles.secondary} onPress={stopNavigation}><Text style={styles.secondaryText}>Stop navigation</Text></Pressable></>}</View>}
          <View style={styles.sectionRow}><Text style={styles.eyebrow}>COMMUNITY</Text><Pressable onPress={() => setCommunityOpen(!communityOpen)}><Text style={styles.link}>{communityOpen ? "Close" : `Reports (${reports.length})`}</Text></Pressable></View>
          {communityOpen && <><View style={styles.modeRow}>{["accident", "congestion", "roadworks", "hazard", "other"].map((item) => <Pressable key={item} onPress={() => setCategory(item)} style={[styles.modeChip, category === item && styles.modeChipSelected]}><Text style={[styles.modeText, category === item && styles.modeTextSelected]}>{item.replaceAll("_", " ")}</Text></Pressable>)}</View><TextInput style={styles.description} placeholder="Describe the road event (optional)" maxLength={500} value={description} onChangeText={setDescription} /><Pressable style={styles.primary} onPress={() => void submitReport()} disabled={busy || !position}><Text style={styles.primaryText}>{busy ? "Sending…" : "Report my location"}</Text></Pressable>{!position && <Text style={styles.routeNote}>Use your location to send a report and vote.</Text>}{reports.map((report) => <View key={report.id} style={styles.reportCard}><Text style={styles.reportTitle}>{report.category.replaceAll("_", " ")} · {report.status}</Text><Text style={styles.routeNote}>{report.description || "Community report"}</Text><View style={styles.voteRow}><Pressable onPress={() => void vote(report.id,"confirm")}><Text style={styles.link}>Confirm</Text></Pressable><Pressable onPress={() => void vote(report.id,"resolved")}><Text style={styles.link}>Resolved</Text></Pressable><Pressable onPress={() => void vote(report.id,"incorrect")}><Text style={styles.link}>Incorrect</Text></Pressable></View></View>)}</>}
        </ScrollView>
      </View>
    </SafeAreaView>
    <Modal visible={accountOpen} transparent animationType="slide" onRequestClose={() => setAccountOpen(false)}><View style={styles.modalShade}><View style={styles.accountCard}><View style={styles.sectionRow}><Text style={styles.brand}>My MODJI</Text><Pressable onPress={() => setAccountOpen(false)}><Text style={styles.link}>Close</Text></Pressable></View>{account ? <><Text style={styles.routeNote}>Signed in as</Text><Text style={styles.accountEmail}>{account.display_name || account.email}</Text><Text style={styles.routeNote}>{account.email}</Text><TextInput style={styles.authInput} placeholder="Display name" value={profileName} onChangeText={setProfileName} maxLength={80} /><Pressable style={styles.secondary} onPress={() => void saveProfile()}><Text style={styles.secondaryText}>Save profile</Text></Pressable><Text style={styles.eyebrow}>SAVED PLACES</Text>{savedPlaces.map((saved) => <Pressable key={saved.id} style={styles.reportCard} onPress={() => { setPlace({ lat: String(saved.latitude), lon: String(saved.longitude), display_name: saved.address || saved.label }); camera.current?.flyTo({ center: [saved.longitude, saved.latitude], zoom: 15, duration: 700 }); setAccountOpen(false); }}><Text style={styles.reportTitle}>{saved.label}</Text><Text style={styles.routeNote}>{saved.address || "Saved location"}</Text></Pressable>)}{savedPlaces.length === 0 && <Text style={styles.routeNote}>No saved places yet.</Text>}<Text style={styles.eyebrow}>RECENT JOURNEYS</Text>{journeyHistory.slice(0, 5).map((journey) => <Text key={journey.id} style={styles.routeNote}>{journey.origin_label || "Origin"} → {journey.destination_label || "Destination"}{journey.distance_meters ? ` · ${(journey.distance_meters / 1000).toFixed(1)} km` : ""}</Text>)}<Pressable style={styles.secondary} onPress={() => void signOut()}><Text style={styles.secondaryText}>Sign out</Text></Pressable><Pressable style={styles.deleteButton} onPress={deleteAccount}><Text style={styles.deleteText}>Delete account and data</Text></Pressable></> : <><View style={styles.modeRow}><Pressable onPress={() => setAuthMode("login")} style={[styles.modeChip, authMode === "login" && styles.modeChipSelected]}><Text style={styles.modeText}>Sign in</Text></Pressable><Pressable onPress={() => setAuthMode("register")} style={[styles.modeChip, authMode === "register" && styles.modeChipSelected]}><Text style={styles.modeText}>Create account</Text></Pressable></View>{authMode === "register" && <TextInput style={styles.authInput} placeholder="Your name (optional)" value={displayName} onChangeText={setDisplayName} maxLength={80} /> }<TextInput style={styles.authInput} placeholder="Email address" autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={authEmail} onChangeText={setAuthEmail} /><TextInput style={styles.authInput} placeholder={authMode === "register" ? "Password (12 characters min.)" : "Password"} secureTextEntry value={authPassword} onChangeText={setAuthPassword} autoComplete={authMode === "login" ? "current-password" : "new-password"} /><Pressable style={styles.primary} onPress={() => void authenticate()} disabled={busy}><Text style={styles.primaryText}>{busy ? "Please wait…" : authMode === "login" ? "Sign in" : "Create account"}</Text></Pressable><Text style={styles.routeNote}>Password reset is not available yet because no email service is connected.</Text>{authMessage ? <Text style={styles.message}>{authMessage}</Text> : null}</>}</View></View></Modal>
    {busy && !place && <ActivityIndicator style={styles.loading} color="#243d36" />}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#e8ede7" }, overlay: { flex: 1, justifyContent: "space-between" }, topCard: { marginHorizontal: 14, marginTop: 8, padding: 14, backgroundColor: "#fffffff2", borderRadius: 16, shadowColor: "#203326", shadowOpacity: 0.12, shadowRadius: 16, elevation: 4 }, brandRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 }, brand: { fontSize: 19, letterSpacing: 3, fontWeight: "800", color: "#19231f" }, tagline: { marginLeft: 10, fontSize: 11, color: "#78847d", flex: 1 }, accountButton: { padding: 7, marginRight: 5, borderRadius: 8, backgroundColor: "#edf2ee" }, accountText: { color: "#243d36", fontSize: 9, fontWeight: "800" }, locate: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#edf2ee" }, locateText: { fontSize: 20, color: "#243d36" }, searchRow: { flexDirection: "row", gap: 8 }, searchInput: { flex: 1, height: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: "#dfe5e1", borderRadius: 9, backgroundColor: "white", color: "#19231f" }, searchButton: { paddingHorizontal: 14, borderRadius: 8, justifyContent: "center", backgroundColor: "#243d36" }, searchButtonText: { color: "white", fontWeight: "700", fontSize: 12 }, message: { marginTop: 9, color: "#98392c", fontSize: 11 }, bottomCard: { maxHeight: "54%", marginHorizontal: 12, marginBottom: 12, borderRadius: 18, backgroundColor: "#fffffffa", shadowColor: "#203326", shadowOpacity: 0.15, shadowRadius: 20, elevation: 7 }, bottomContent: { padding: 18, paddingBottom: 24 }, eyebrow: { color: "#85918a", fontSize: 9, letterSpacing: 1.4, fontWeight: "800" }, prompt: { marginTop: 6, fontSize: 23, fontWeight: "800", color: "#19231f" }, placeName: { marginTop: 6, fontSize: 14, lineHeight: 20, fontWeight: "700", color: "#19231f" }, modeRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 }, modeChip: { paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderColor: "#e0e6e1", borderRadius: 18, backgroundColor: "white" }, modeChipSelected: { borderColor: "#243d36", backgroundColor: "#edf2ee" }, modeText: { fontSize: 10, color: "#55635a", textTransform: "capitalize" }, modeTextSelected: { color: "#243d36", fontWeight: "800" }, primary: { height: 44, marginTop: 12, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: "#243d36" }, primaryText: { color: "white", fontSize: 12, fontWeight: "800" }, routeCard: { marginTop: 12, padding: 12, backgroundColor: "#f5f7f5", borderRadius: 10 }, routeMetric: { fontSize: 13, color: "#243d36", fontWeight: "800" }, routeNote: { marginTop: 5, fontSize: 10, color: "#7a8780", lineHeight: 15 }, maneuver: { marginTop: 10, color: "#35453b", fontSize: 11, lineHeight: 16 }, secondary: { marginTop: 10, height: 39, borderWidth: 1, borderColor: "#dfe5e1", borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "white" }, secondaryText: { color: "#243d36", fontWeight: "700", fontSize: 11 }, sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 18 }, link: { color: "#243d36", fontSize: 10, fontWeight: "800" }, description: { height: 42, marginTop: 10, paddingHorizontal: 10, borderWidth: 1, borderColor: "#dfe5e1", borderRadius: 8, fontSize: 11, backgroundColor: "white" }, reportCard: { marginTop: 9, padding: 10, borderWidth: 1, borderColor: "#e5eae6", borderRadius: 8 }, reportTitle: { color: "#243d36", textTransform: "capitalize", fontSize: 11, fontWeight: "800" }, voteRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 }, modalShade: { flex: 1, justifyContent: "flex-end", backgroundColor: "#00000066" }, accountCard: { padding: 24, paddingBottom: 38, backgroundColor: "white", borderTopLeftRadius: 20, borderTopRightRadius: 20 }, authInput: { height: 46, marginTop: 11, paddingHorizontal: 12, borderWidth: 1, borderColor: "#dfe5e1", borderRadius: 8, color: "#19231f" }, accountEmail: { marginTop: 9, fontSize: 14, fontWeight: "700", color: "#19231f" }, deleteButton: { marginTop: 18, alignItems: "center", padding: 10 }, deleteText: { color: "#9d3023", fontSize: 11, fontWeight: "700" }, loading: { position: "absolute", right: 24, top: 82 }
});
