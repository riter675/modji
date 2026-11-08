import { NextRequest, NextResponse } from "next/server";
import { authenticatedAccount } from "../../../../lib/auth";
import { ensureDatabaseReady, getPool } from "../../../../lib/db";
export const runtime = "nodejs";
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid place id." }, { status: 400 });
  try { const pool = getPool(); await ensureDatabaseReady(); const client = await pool.connect(); try { const session = await authenticatedAccount(request, client); if (!session) return NextResponse.json({ error: "Sign in to remove saved places." }, { status: 401 }); const result = await client.query("DELETE FROM modji_saved_places WHERE id=$1 AND user_id=$2", [id, session.account.id]); return result.rowCount ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Saved place not found." }, { status: 404 }); } finally { client.release(); } }
  catch { return NextResponse.json({ error: "Saved place could not be removed." }, { status: 503 }); }
}
