import { compare } from "bcryptjs";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSession } from "../../../../lib/auth";
import { ensureDatabaseReady, getPool } from "../../../../lib/db";
import { checkRateLimit } from "../../../../lib/rate-limit";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const email = body.email?.trim().toLowerCase(); const password = body.password;
  if (!email || email.length > 254 || !password || password.length > 128) return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  let client; try { const pool = getPool(); await ensureDatabaseReady(); client = await pool.connect(); } catch { return NextResponse.json({ error: "Account service is temporarily unavailable." }, { status: 503 }); }
  const response = NextResponse.json({ ok: true });
  try {
    await client.query("BEGIN");
    const emailHash = createHash("sha256").update(email).digest("hex");
    const redisAllowed = await checkRateLimit(emailHash, 12, 900);
    if (redisAllowed === false) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 }); }
    await client.query("DELETE FROM modji_login_attempts WHERE attempted_at < now()-interval '1 day'");
    const attempts = await client.query("SELECT count(*)::int AS count FROM modji_login_attempts WHERE email_hash=$1 AND attempted_at>now()-interval '15 minutes'", [emailHash]);
    if (attempts.rows[0].count >= 12) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 }); }
    await client.query("INSERT INTO modji_login_attempts(email_hash) VALUES($1)", [emailHash]);
    const { rows } = await client.query("SELECT id,email,display_name,preferred_mode,locale,created_at,password_hash FROM modji_users WHERE email=$1 AND disabled_at IS NULL", [email]);
    const passwordDigest = createHash("sha256").update(password, "utf8").digest("hex");
    const valid = rows[0] ? await compare(passwordDigest, rows[0].password_hash) : false;
    if (!valid) { await client.query("COMMIT"); return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 }); }
    await createSession(client, request, response, rows[0].id);
    await client.query("COMMIT");
    const account = { id: rows[0].id, email: rows[0].email, display_name: rows[0].display_name, preferred_mode: rows[0].preferred_mode, locale: rows[0].locale, created_at: rows[0].created_at };
    const bodyResult: Record<string, unknown> = { account };
    if (request.headers.get("x-modji-client") === "native") bodyResult.sessionToken = response.headers.get("x-modji-session");
    response.headers.delete("x-modji-session");
    return NextResponse.json(bodyResult, { headers: response.headers });
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); console.error("MODJI login failed", error instanceof Error ? error.message : "unknown"); return NextResponse.json({ error: "Account service is temporarily unavailable." }, { status: 503 }); }
  finally { client.release(); }
}
