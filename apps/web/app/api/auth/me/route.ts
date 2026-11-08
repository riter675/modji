import { NextRequest, NextResponse } from "next/server";
import { authenticatedAccount, clearSessionCookie } from "../../../../lib/auth";
import { ensureDatabaseReady, getPool } from "../../../../lib/db";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try { await ensureDatabaseReady(); const session = await authenticatedAccount(request); return session ? NextResponse.json({ account: session.account }) : NextResponse.json({ error: "Sign in to continue." }, { status: 401 }); }
  catch { return NextResponse.json({ error: "Account service is temporarily unavailable." }, { status: 503 }); }
}
export async function PATCH(request: NextRequest) {
  let body: { displayName?: string; preferredMode?: string; locale?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  if ((body.displayName !== undefined && (typeof body.displayName !== "string" || body.displayName.trim().length > 80)) || (body.preferredMode !== undefined && !["auto","pedestrian","bicycle"].includes(body.preferredMode)) || (body.locale !== undefined && !["en","fr"].includes(body.locale))) return NextResponse.json({ error: "Profile settings are invalid." }, { status: 400 });
  try { const pool = getPool(); await ensureDatabaseReady(); const client = await pool.connect(); try { const session = await authenticatedAccount(request, client); if (!session) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 }); const { rows } = await client.query("UPDATE modji_users SET display_name=COALESCE($2,display_name),preferred_mode=COALESCE($3,preferred_mode),locale=COALESCE($4,locale),updated_at=now() WHERE id=$1 RETURNING id,email,display_name,preferred_mode,locale,created_at", [session.account.id, body.displayName?.trim(), body.preferredMode, body.locale]); return NextResponse.json({ account: rows[0] }); } finally { client.release(); } } catch { return NextResponse.json({ error: "Account service is temporarily unavailable." }, { status: 503 }); }
}
export async function DELETE(request: NextRequest) {
  try { const pool = getPool(); await ensureDatabaseReady(); const client = await pool.connect(); try { const session = await authenticatedAccount(request, client); if (!session) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 }); await client.query("DELETE FROM modji_users WHERE id=$1", [session.account.id]); const response = NextResponse.json({ ok: true }); clearSessionCookie(response); return response; } finally { client.release(); } } catch { return NextResponse.json({ error: "Account service is temporarily unavailable." }, { status: 503 }); }
}
