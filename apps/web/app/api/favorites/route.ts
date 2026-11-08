import { NextRequest, NextResponse } from "next/server";
import { authenticatedAccount } from "../../../lib/auth";
import { ensureDatabaseReady, getPool } from "../../../lib/db";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try { const pool = getPool(); await ensureDatabaseReady(); const client = await pool.connect(); try { const session = await authenticatedAccount(request, client); if (!session) return NextResponse.json({ error: "Sign in to see saved places." }, { status: 401 }); const { rows } = await client.query("SELECT id,label,address,latitude,longitude,created_at FROM modji_saved_places WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100", [session.account.id]); return NextResponse.json({ places: rows }); } finally { client.release(); } }
  catch { return NextResponse.json({ error: "Saved places are temporarily unavailable." }, { status: 503 }); }
}

export async function POST(request: NextRequest) {
  let body: { label?: string; address?: string; latitude?: number; longitude?: number };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (!body.label?.trim() || body.label.length > 80 || (body.address && body.address.length > 300) || !Number.isFinite(body.latitude) || !Number.isFinite(body.longitude) || Math.abs(body.latitude!) > 90 || Math.abs(body.longitude!) > 180) return NextResponse.json({ error: "Provide a label and valid coordinates." }, { status: 400 });
  try { const pool = getPool(); await ensureDatabaseReady(); const client = await pool.connect(); try { const session = await authenticatedAccount(request, client); if (!session) return NextResponse.json({ error: "Sign in to save places." }, { status: 401 }); const { rows } = await client.query("INSERT INTO modji_saved_places(user_id,label,address,latitude,longitude) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,label) DO UPDATE SET address=excluded.address,latitude=excluded.latitude,longitude=excluded.longitude RETURNING id,label,address,latitude,longitude,created_at", [session.account.id, body.label.trim(), body.address?.trim() || null, body.latitude, body.longitude]); return NextResponse.json({ place: rows[0] }, { status: 201 }); } finally { client.release(); } }
  catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "23505") return NextResponse.json({ error: "This place is already saved under another label." }, { status: 409 }); return NextResponse.json({ error: "Saved place could not be stored." }, { status: 503 }); }
}
