import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
type Link = { points?: Array<{ lat: number; lng: number }> };
type Shape = { links?: Link[] };
type FlowItem = {
  location?: { description?: string; shape?: Shape };
  currentFlow?: { jamFactor?: number; speed?: number; freeFlow?: number; confidence?: number; traversability?: string };
};
type IncidentItem = {
  location?: { description?: string; shape?: Shape };
  incidentDetails?: { originalId?: string; type?: string; criticality?: string; roadClosed?: boolean; startTime?: string; endTime?: string; summary?: { value?: string }; description?: { value?: string } };
};
type ProviderResponse<T> = { sourceUpdated?: string; results?: T[] };
type TrafficFeature = {
  type: "Feature";
  properties: Record<string, string | number | boolean | null>;
  geometry: { type: "MultiLineString"; coordinates: [number, number][][] };
};
const cache = new Map<string, { expires: number; data: unknown }>();

function asLines(shape?: Shape): [number, number][][] {
  return (shape?.links ?? []).map((link) => (link.points ?? [])
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
    .map((point) => [point.lng, point.lat] as [number, number]))
    .filter((line) => line.length > 1);
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.HERE_TRAFFIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "HERE traffic is not configured. Add HERE_TRAFFIC_API_KEY to the server environment." }, { status: 503 });
  const values = request.nextUrl.searchParams.get("bbox")?.split(",").map(Number);
  if (!values || values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    return NextResponse.json({ error: "Provide bbox=west,south,east,north." }, { status: 400 });
  }
  const [west, south, east, north] = values;
  if (west < -180 || east > 180 || south < -85 || north > 85 || west >= east || south >= north || east - west > 0.3 || north - south > 0.3) {
    return NextResponse.json({ error: "Choose a valid map area no wider than 0.3 degrees." }, { status: 400 });
  }
  const cacheKey = values.join(",");
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return NextResponse.json(cached.data, { headers: { "Cache-Control": "private, max-age=30" } });
  const area = `bbox:${west},${south},${east},${north}`;
  const endpoint = (kind: "flow" | "incidents") => {
    const url = new URL(`https://data.traffic.hereapi.com/v7/${kind}`);
    url.searchParams.set("in", area);
    url.searchParams.set("locationReferencing", "shape");
    url.searchParams.set("apiKey", apiKey);
    if (kind === "flow") url.searchParams.set("minJamFactor", "1");
    return url;
  };
  try {
    const [flowResponse, incidentResponse] = await Promise.all([
      fetch(endpoint("flow"), { signal: AbortSignal.timeout(8000), cache: "no-store" }),
      fetch(endpoint("incidents"), { signal: AbortSignal.timeout(8000), cache: "no-store" }),
    ]);
    if (!flowResponse.ok || !incidentResponse.ok) {
      const status = !flowResponse.ok ? flowResponse.status : incidentResponse.status;
      throw new Error(status === 401 || status === 403 ? "HERE rejected the traffic credentials or product permissions." : `HERE traffic returned ${status}.`);
    }
    const [flow, incidents] = await Promise.all([flowResponse.json(), incidentResponse.json()]) as [ProviderResponse<FlowItem>, ProviderResponse<IncidentItem>];
    const flows = (flow.results ?? []).flatMap((item) => {
      const coordinates = asLines(item.location?.shape);
      if (!coordinates.length) return [];
      const current = item.currentFlow ?? {};
      const feature: TrafficFeature = {
        type: "Feature",
        geometry: { type: "MultiLineString", coordinates },
        properties: {
          source: "HERE Traffic API v7",
          road: item.location?.description ?? "",
          jamFactor: current.jamFactor ?? 0,
          speedMps: current.speed ?? 0,
          freeFlowMps: current.freeFlow ?? 0,
          confidence: current.confidence ?? 0,
          traversability: current.traversability ?? "unknown",
        },
      };
      return [feature];
    });
    const events = (incidents.results ?? []).flatMap((item) => {
      const coordinates = asLines(item.location?.shape);
      const details = item.incidentDetails ?? {};
      if (!coordinates.length || (details.endTime && Date.parse(details.endTime) < Date.now())) return [];
      return [{
        type: "Feature" as const,
        geometry: { type: "MultiLineString" as const, coordinates },
        properties: {
          source: "HERE Traffic API v7",
          id: details.originalId ?? "",
          road: item.location?.description ?? "",
          category: details.type ?? "other",
          severity: details.criticality ?? "unknown",
          roadClosed: details.roadClosed ?? false,
          startTime: details.startTime ?? "",
          endTime: details.endTime ?? "",
          summary: details.summary?.value ?? details.description?.value ?? "Traffic incident",
        },
      }];
    });
    const data = {
      provider: "HERE Traffic API v7",
      updatedAt: { flow: flow.sourceUpdated ?? null, incidents: incidents.sourceUpdated ?? null },
      flow: { type: "FeatureCollection", features: flows },
      incidents: { type: "FeatureCollection", features: events },
      counts: { flow: flows.length, incidents: events.length },
    };
    cache.set(cacheKey, { expires: Date.now() + 30_000, data });
    if (cache.size > 150) cache.delete(cache.keys().next().value as string);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : "HERE traffic is temporarily unavailable.";
    return NextResponse.json({ error }, { status: 503 });
  }
}
