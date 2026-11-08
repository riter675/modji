import { hash } from "bcryptjs";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSession } from "../../../../lib/auth";
import { ensureDatabaseReady, getPool } from "../../../../lib/db";
import { checkRateLimit } from "../../../../lib/rate-limit";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string; displayName?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const email = body.email?.trim().toLowerCase(); const password = body.password; const displayName = body.displayName?.trim() ?? "";
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length < 12 || password.length > 128 || displayName.length > 80) return NextResponse.json({ error: "Use a valid email, a password of 12–128 characters and a name under 80 characters." }, { status: 400 });
  let client; try { const pool = getPool(); await ensureDatabaseReady(); client = await pool.connect(); } catch { return NextResponse.json({ error: "Account service is temporarily unavailable." }, { status: 503 }); }
  const response = NextResponse.json({ ok: true }, { status: 201 });
  try {
    await client.query("BEGIN");
    const emailHash = createHash("sha256").update(email).digest("hex");
    const redisAllowed = await checkRateLimit(emailHash, 5, 86400);
    if (redisAllowed === false) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Too many sign-up attempts. Try again tomorrow." }, { status: 429 }); }
    if (redisAllowed === null) {
      await client.query("DELETE FROM modji_register_attempts WHERE attempted_at < now()-interval '7 days'");
      const recent = await client.query("SELECT count(*)::int AS count FROM modji_register_attempts WHERE email_hash=$1 AND attempted_at>now()-interval '1 day'", [emailHash]);
      if (recent.rows[0].count >= 5) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Too many sign-up attempts. Try again tomorrow." }, { status: 429 }); }
      await client.query("INSERT INTO modji_register_attempts(email_hash) VALUES($1)", [emailHash]);
    }
    const passwordDigest = createHash("sha256").update(password, "utf8").digest("hex");
    const { rows } = await client.query("INSERT INTO modji_users(email,password_hash,display_name) VALUES($1,$2,$3) ON CONFLICT(email) DO NOTHING RETURNING id,email,display_name,preferred_mode,locale,created_at", [email, await hash(passwordDigest, 12), displayName]);
    if (!rows[0]) { await client.query("ROLLBACK"); return NextResponse.json({ error: "This email is already registered." }, { status: 409 }); }
    await createSession(client, request, response, rows[0].id);
    await client.query("COMMIT");
    const native = request.headers.get("x-modji-client") === "native";
    const bodyResult: Record<string, unknown> = { account: rows[0] };
    if (native) bodyResult.sessionToken = response.headers.get("x-modji-session");
    response.headers.delete("x-modji-session");
    return NextResponse.json(bodyResult, { status: 201, headers: response.headers });
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); console.error("MODJI account registration failed", error instanceof Error ? error.message : "unknown"); return NextResponse.json({ error: "Account could not be created." }, { status: 503 }); }
  finally { client.release(); }
}
