import { NextRequest, NextResponse } from "next/server";
import { dbError, ensureDatabaseReady, getPool, reporter } from "../../../../../../lib/community";

export const runtime = "nodejs";
const votes = ["confirm", "resolved", "incorrect"];

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid report id." }, { status: 400 });
  let body: { vote?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  if (!votes.includes(body.vote || "")) return NextResponse.json({ error: "Vote must be confirm, resolved or incorrect." }, { status: 400 });
  let client; try { const pool = getPool(); await ensureDatabaseReady(); client = await pool.connect(); } catch { return NextResponse.json({ error: "Community reports are temporarily unavailable. Database setup may still be completing." }, { status: 503 }); }
  const response = NextResponse.json({ ok: true });
  try {
    await client.query("BEGIN");
    const reporterId = await reporter(client, request, response);
    const { rows } = await client.query("SELECT id,status,reporter_id FROM modji_community_reports WHERE id=$1 FOR UPDATE", [id]);
    if (!rows.length || !["unverified", "confirmed"].includes(rows[0].status)) { await client.query("ROLLBACK"); return NextResponse.json({ error: "This report is no longer active." }, { status: 404 }); }
    if (rows[0].reporter_id === reporterId) { await client.query("ROLLBACK"); return NextResponse.json({ error: "You cannot validate your own report." }, { status: 409 }); }
    await client.query("INSERT INTO modji_report_votes(report_id,reporter_id,vote) VALUES($1,$2,$3) ON CONFLICT(report_id,reporter_id) DO UPDATE SET vote=excluded.vote,created_at=now()", [id, reporterId, body.vote]);
    const counts = await client.query("SELECT count(*) FILTER(WHERE vote='confirm')::int confirms,count(*) FILTER(WHERE vote='resolved')::int resolves,count(*) FILTER(WHERE vote='incorrect')::int incorrect FROM modji_report_votes WHERE report_id=$1", [id]);
    const c = counts.rows[0];
    const status = c.incorrect >= 3 && c.incorrect > c.confirms ? "rejected" : c.resolves >= 2 && c.resolves >= c.confirms ? "resolved" : c.confirms >= 2 ? "confirmed" : "unverified";
    const updated = await client.query("UPDATE modji_community_reports SET status=$2,validation_count=$3,resolved_at=CASE WHEN $2='resolved' THEN now() WHEN $2='unverified' OR $2='confirmed' THEN NULL ELSE resolved_at END WHERE id=$1 RETURNING id,status,validation_count", [id, status, c.confirms + c.resolves + c.incorrect]);
    await client.query("COMMIT");
    return NextResponse.json({ report: updated.rows[0] }, { headers: response.headers });
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); return NextResponse.json(dbError(error), { status: 503 }); }
  finally { client.release(); }
}
