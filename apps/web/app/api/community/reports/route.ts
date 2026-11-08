import { NextRequest, NextResponse } from "next/server";
import { categories, dbError, ensureDatabaseReady, getPool, reporter } from "../../../../lib/community";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("bbox");
  const values = raw?.split(",").map(Number);
  if (!values || values.length !== 4 || !values.every(Number.isFinite)) return NextResponse.json({ error: "Provide bbox=west,south,east,north." }, { status: 400 });
  const [west, south, east, north] = values;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north || east - west > 30 || north - south > 30) return NextResponse.json({ error: "Map bounds are invalid or too large." }, { status: 400 });
  try {
    const pool = getPool(); await ensureDatabaseReady();
    const { rows } = await pool.query("SELECT id,category,latitude,longitude,description,status,validation_count,created_at,expires_at FROM modji_community_reports WHERE status IN ('unverified','confirmed') AND expires_at > now() AND latitude BETWEEN $1 AND $2 AND longitude BETWEEN $3 AND $4 ORDER BY created_at DESC LIMIT 300", [south, north, west, east]);
    return NextResponse.json({ reports: rows });
  } catch (error) { return NextResponse.json(dbError(error), { status: 503 }); }
}

export async function POST(request: NextRequest) {
  let body: { latitude?: number; longitude?: number; category?: string; description?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const { latitude, longitude, category, description } = body;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude!) > 90 || Math.abs(longitude!) > 180 || !categories.includes(category as typeof categories[number]) || (description != null && (typeof description !== "string" || description.length > 500))) return NextResponse.json({ error: "Choose a valid location, category and description (500 characters max)." }, { status: 400 });
  let client; try { const pool = getPool(); await ensureDatabaseReady(); client = await pool.connect(); } catch { client = null; }
  if (!client) return NextResponse.json({ error: "Community reports are temporarily unavailable. Database setup may still be completing." }, { status: 503 });
  const response = NextResponse.json({ ok: true }, { status: 201 });
  try {
    await client.query("BEGIN");
    const reporterId = await reporter(client, request, response);
    const rate = await client.query("SELECT count(*)::int AS count FROM modji_community_reports WHERE reporter_id=$1 AND created_at > now()-interval '1 hour'", [reporterId]);
    if (rate.rows[0].count >= 5) { await client.query("ROLLBACK"); return NextResponse.json({ error: "You can submit up to five reports per hour." }, { status: 429 }); }
    const dupe = await client.query("SELECT id FROM modji_community_reports WHERE category=$1 AND status IN ('unverified','confirmed') AND expires_at>now() AND 111320*sqrt(power(latitude-$2,2)+power((longitude-$3)*cos(radians($2)),2)) < 50 LIMIT 1", [category, latitude, longitude]);
    if (dupe.rowCount) { await client.query("ROLLBACK"); return NextResponse.json({ error: "A similar active report is already nearby." }, { status: 409 }); }
    const { rows } = await client.query("INSERT INTO modji_community_reports(reporter_id,category,latitude,longitude,description) VALUES($1,$2,$3,$4,$5) RETURNING id,category,latitude,longitude,description,status,validation_count,created_at,expires_at", [reporterId, category, latitude, longitude, description?.trim() || null]);
    await client.query("COMMIT");
    return NextResponse.json({ report: rows[0] }, { status: 201, headers: response.headers });
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); return NextResponse.json(dbError(error), { status: 503 }); }
  finally { client.release(); }
}
