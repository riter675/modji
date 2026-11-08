import { NextRequest, NextResponse } from "next/server";
import { decodeShape } from "../../../lib/valhalla";

export const runtime = "nodejs";
let lastProviderRequest = 0;
let providerQueue = Promise.resolve();

type Coordinate = { lat: number; lon: number };
type Costing = "auto" | "pedestrian" | "bicycle";
type RawTrip = {
  status?: number;
  status_message?: string;
  summary?: { length?: number; time?: number };
  legs?: Array<{
    shape?: string;
    maneuvers?: Array<{ instruction?: string; length?: number; time?: number; street_names?: string[]; end_shape_index?: number }>;
  }>;
};

async function respectProviderLimit() {
  const turn = providerQueue.then(async () => {
    const delay = 1100 - (Date.now() - lastProviderRequest);
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    lastProviderRequest = Date.now();
  });
  providerQueue = turn.then(() => undefined, () => undefined);
  await turn;
}

function normalizeTrip(trip: RawTrip) {
  const leg = trip.legs?.[0];
  if (!leg?.shape || !trip.summary || !Number.isFinite(trip.summary.length) || !Number.isFinite(trip.summary.time)) {
    throw new Error("The routing provider returned an incomplete route.");
  }
  return {
    distanceKm: trip.summary.length as number,
    durationSeconds: trip.summary.time as number,
    geometry: { type: "LineString" as const, coordinates: decodeShape(leg.shape) },
    maneuvers: (leg.maneuvers ?? []).map((item) => ({
      instruction: String(item.instruction ?? "Continue"),
      distanceKm: Number(item.length ?? 0),
      durationSeconds: Number(item.time ?? 0),
      street: Array.isArray(item.street_names) ? item.street_names.join(", ") : "",
      endShapeIndex: Number(item.end_shape_index ?? Number.POSITIVE_INFINITY),
    })),
  };
}

export async function POST(request: NextRequest) {
  let body: { origin?: Coordinate; destination?: Coordinate; costing?: Costing };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 }); }
  const { origin, destination, costing = "auto" } = body;
  const validCoordinate = (point?: Coordinate) => point && Number.isFinite(point.lat) && Number.isFinite(point.lon) && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180;
  if (!validCoordinate(origin) || !validCoordinate(destination)) {
    return NextResponse.json({ error: "Choose valid origin and destination coordinates." }, { status: 400 });
  }
  if (!["auto", "pedestrian", "bicycle"].includes(costing)) {
    return NextResponse.json({ error: "Choose driving, walking or cycling." }, { status: 400 });
  }
  const baseUrl = (process.env.VALHALLA_URL || "https://valhalla1.openstreetmap.de").replace(/\/$/, "");
  try {
    await respectProviderLimit();
    const response = await fetch(`${baseUrl}/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "MODJI/0.1 (+https://github.com/riter675/modji)" },
      body: JSON.stringify({
        locations: [origin, destination],
        costing,
        units: "kilometers",
        alternates: 2,
        directions_options: { units: "kilometers" },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Routing provider returned ${response.status}.`);
    const data = await response.json() as { trip?: RawTrip; alternates?: Array<{ trip: RawTrip }> };
    if (!data.trip || data.trip.status !== 0) throw new Error(data.trip?.status_message || "No road route was found.");
    return NextResponse.json({
      provider: "Valhalla",
      trafficAdjusted: false,
      route: normalizeTrip(data.trip),
      alternatives: Array.isArray(data.alternates) ? data.alternates.map((item) => normalizeTrip(item.trip)) : [],
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Routing is temporarily unavailable.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
