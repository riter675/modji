import { NextRequest, NextResponse } from "next/server";
import { authenticatedAccount } from "../../../lib/auth";
import { ensureDatabaseReady, getPool } from "../../../lib/db";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try { const pool = getPool(); await ensureDatabaseReady(); const client = await pool.connect(); try { const session = await authenticatedAccount(request, client); if (!session) return NextResponse.json({ error: "Sign in to see journey history." }, { status: 401 }); const { rows } = await client.query("SELECT id,origin_label,destination_label,transport_mode,distance_meters,duration_seconds,created_at FROM modji_journeys WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50", [session.account.id]); return NextResponse.json({ journeys: rows }); } finally { client.release(); } }
  catch { return NextResponse.json({ error: "Journey history is temporarily unavailable." }, { status: 503 }); }
}
export async function POST(request: NextRequest) {
  let body: { originLabel?: string; destinationLabel?: string; origin?: { lat?: number; lon?: number }; destination?: { lat?: number; lon?: number }; mode?: string; distanceMeters?: number; durationSeconds?: number };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const validPoint = (p?: { lat?: number; lon?: number }) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat!) <= 90 && Math.abs(p.lon!) <= 180;
  if (!validPoint(body.origin) || !validPoint(body.destination) || !["auto","pedestrian","bicycle"].includes(body.mode || "") || !Number.isFinite(body.distanceMeters) || !Number.isFinite(body.durationSeconds)) return NextResponse.json({ error: "Journey details are invalid." }, { status: 400 });
  try { const pool = getPool(); await ensureDatabaseReady(); const client = await pool.connect(); try { const session = await authenticatedAccount(request, client); if (!session) return NextResponse.json({ error: "Sign in to save journey history." }, { status: 401 }); const { rows } = await client.query("INSERT INTO modji_journeys(user_id,origin_label,destination_label,origin_latitude,origin_longitude,destination_latitude,destination_longitude,transport_mode,distance_meters,duration_seconds) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,origin_label,destination_label,transport_mode,distance_meters,duration_seconds,created_at", [session.account.id, body.originLabel?.slice(0,300) || null, body.destinationLabel?.slice(0,300) || null, body.origin!.lat, body.origin!.lon, body.destination!.lat, body.destination!.lon, body.mode, body.distanceMeters, body.durationSeconds]); return NextResponse.json({ journey: rows[0] }, { status: 201 }); } finally { client.release(); } }
  catch { return NextResponse.json({ error: "Journey could not be saved." }, { status: 503 }); }
}
