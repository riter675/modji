import { createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { ensureDatabaseReady, getPool } from "./db";

export const categories = ["accident", "congestion", "slow_traffic", "roadworks", "road_closure", "hazard", "object_on_road", "vehicle_breakdown", "other"] as const;
export type Category = (typeof categories)[number];

export async function reporter(client: PoolClient, request: NextRequest, response: NextResponse) {
  const existing = request.cookies.get("modji_reporter")?.value;
  const token = existing && /^[a-f0-9]{64}$/.test(existing) ? existing : randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  const result = await client.query("INSERT INTO modji_reporters(token_hash) VALUES ($1) ON CONFLICT (token_hash) DO UPDATE SET last_seen_at=now() RETURNING id", [hash]);
  if (!existing) response.cookies.set("modji_reporter", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return result.rows[0].id as string;
}

export function dbError(error: unknown) {
  console.error("MODJI community database error", error instanceof Error ? error.message : "unknown");
  return { error: "Community reports are temporarily unavailable. Database setup may still be completing." };
}

export { ensureDatabaseReady, getPool };
