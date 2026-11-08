import { createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { ensureDatabaseReady, getPool } from "./db";

export type Account = { id: string; email: string; display_name: string; preferred_mode: "auto" | "pedestrian" | "bicycle"; locale: string; created_at: string };
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const cookieName = "modji_session";

export async function createSession(client: PoolClient, request: NextRequest, response: NextResponse, userId: string) {
  const token = randomBytes(32).toString("base64url");
  await client.query("INSERT INTO modji_sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '30 days')", [userId, hashToken(token)]);
  if (request.headers.get("x-modji-client") === "native") response.headers.set("x-modji-session", token);
  else response.cookies.set(cookieName, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return token;
}

export async function authenticatedAccount(request: NextRequest, client?: PoolClient) {
  const auth = request.headers.get("authorization");
  const token = request.cookies.get(cookieName)?.value ?? (auth?.startsWith("Bearer ") ? auth.slice(7) : "");
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const ownClient = client ?? await (async () => { const pool = getPool(); await ensureDatabaseReady(); return pool.connect(); })();
  try {
    const { rows } = await ownClient.query("SELECT u.id,u.email,u.display_name,u.preferred_mode,u.locale,u.created_at,s.id AS session_id FROM modji_sessions s JOIN modji_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.disabled_at IS NULL", [hashToken(token)]);
    if (!rows[0]) return null;
    void ownClient.query("UPDATE modji_sessions SET last_seen_at=now() WHERE id=$1", [rows[0].session_id]).catch(() => undefined);
    const account: Account = { id: rows[0].id, email: rows[0].email, display_name: rows[0].display_name, preferred_mode: rows[0].preferred_mode, locale: rows[0].locale, created_at: rows[0].created_at };
    return { account, sessionId: rows[0].session_id as string };
  } finally { if (!client) ownClient.release(); }
}

export async function currentSessionToken(request: NextRequest) {
  const auth = request.headers.get("authorization");
  return request.cookies.get(cookieName)?.value ?? (auth?.startsWith("Bearer ") ? auth.slice(7) : "");
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(cookieName, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}
