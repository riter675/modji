import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, currentSessionToken } from "../../../../lib/auth";
import { ensureDatabaseReady, getPool } from "../../../../lib/db";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  try { const token = await currentSessionToken(request); if (token) { const pool = getPool(); await ensureDatabaseReady(); const digest = createHash("sha256").update(token).digest("hex"); await pool.query("DELETE FROM modji_sessions WHERE token_hash=$1", [digest]); } } catch { return NextResponse.json({ error: "Account service is temporarily unavailable." }, { status: 503 }); }
  clearSessionCookie(response); return response;
}
