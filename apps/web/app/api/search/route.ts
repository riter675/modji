import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
const cache = new Map<string, { expires: number; body: unknown }>();
let lastRequest = 0;
let geocoderQueue = Promise.resolve();

async function respectPublicGeocoderLimit() {
  const turn = geocoderQueue.then(async () => {
    const delay = 1100 - (Date.now() - lastRequest);
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    lastRequest = Date.now();
  });
  geocoderQueue = turn.then(() => undefined, () => undefined);
  await turn;
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query || query.length < 2 || query.length > 160) {
    return NextResponse.json({ error: "Enter a search between 2 and 160 characters." }, { status: 400 });
  }
  const key = query.toLocaleLowerCase();
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return NextResponse.json(cached.body);
  await respectPublicGeocoderLimit();
  try {
    const upstream = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "MODJI/0.1 (+https://github.com/riter675/modji)" },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 0 },
    });
    if (!upstream.ok) throw new Error(`Geocoder returned ${upstream.status}`);
    const results = await upstream.json();
    const body = { results };
    cache.set(key, { expires: Date.now() + 5 * 60_000, body });
    if (cache.size > 300) cache.delete(cache.keys().next().value as string);
    return NextResponse.json(body, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch {
    return NextResponse.json({ error: "Place search is temporarily unavailable. Please try again." }, { status: 503 });
  }
}
