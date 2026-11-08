import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redisEnabled = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const redis = redisEnabled ? Redis.fromEnv() : null;
const limiters = new Map<string, Ratelimit>();

/** Returns null when Redis is not configured or temporarily unavailable. */
export async function checkRateLimit(key: string, maximum: number, seconds: number): Promise<boolean | null> {
  if (!redis) return null;
  const id = `${maximum}:${seconds}`;
  let limiter = limiters.get(id);
  if (!limiter) {
    limiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(maximum, `${seconds} s`), prefix: `modji:${id}`, analytics: false });
    limiters.set(id, limiter);
  }
  try { return (await limiter.limit(key)).success; }
  catch (error) { console.error("MODJI Redis rate limit unavailable", error instanceof Error ? error.message : "unknown"); return null; }
}
