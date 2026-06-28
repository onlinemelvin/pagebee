// Lightweight, dependency-free rate limiter for public endpoints.
//
// Uses Upstash Redis (REST) when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set —
// a fixed-window counter that works across serverless instances on Vercel. Without Upstash it
// falls back to an in-memory window (correct for dev / a single long-running node, best-effort in
// multi-instance serverless). Fails OPEN on any backend error so a limiter hiccup never blocks
// legitimate traffic.

import { NextResponse } from "next/server";

export interface RateResult {
  ok: boolean;
  remaining: number;
  retryAfter: number; // seconds until the window resets (0 when ok)
}

const REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useUpstash = Boolean(REST_URL && REST_TOKEN);

// ── In-memory fallback ──────────────────────────────────────────────────────
const mem = new Map<string, { count: number; resetAt: number }>();

function memLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  // Opportunistic prune so the map can't grow unbounded.
  if (mem.size > 10_000) for (const [k, v] of mem) if (v.resetAt <= now) mem.delete(k);

  const e = mem.get(key);
  if (!e || e.resetAt <= now) {
    mem.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }
  e.count++;
  if (e.count > limit) return { ok: false, remaining: 0, retryAfter: Math.ceil((e.resetAt - now) / 1000) };
  return { ok: true, remaining: limit - e.count, retryAfter: 0 };
}

// ── Upstash (distributed) ───────────────────────────────────────────────────
async function upstashLimit(key: string, limit: number, windowMs: number): Promise<RateResult> {
  try {
    const res = await fetch(`${REST_URL}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${REST_TOKEN}`, "Content-Type": "application/json" },
      // INCR the counter, then set the window TTL only on first hit (NX).
      body: JSON.stringify([
        ["INCR", key],
        ["PEXPIRE", key, windowMs, "NX"],
      ]),
      cache: "no-store",
    });
    if (!res.ok) return { ok: true, remaining: limit, retryAfter: 0 }; // fail open
    const data = (await res.json()) as { result: number }[];
    const count = Number(data?.[0]?.result ?? 0);
    if (count > limit) return { ok: false, remaining: 0, retryAfter: Math.ceil(windowMs / 1000) };
    return { ok: true, remaining: Math.max(0, limit - count), retryAfter: 0 };
  } catch {
    return { ok: true, remaining: limit, retryAfter: 0 }; // fail open
  }
}

/** Consume one unit for `key` within a fixed window. */
export function rateLimit(key: string, opts: { limit: number; windowMs: number }): Promise<RateResult> | RateResult {
  return useUpstash ? upstashLimit(key, opts.limit, opts.windowMs) : memLimit(key, opts.limit, opts.windowMs);
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function tooMany(retryAfter: number, extraHeaders?: Record<string, string>): Response {
  return NextResponse.json(
    { error: "rate_limited" },
    { status: 429, headers: { ...(extraHeaders ?? {}), "Retry-After": String(retryAfter) } },
  );
}

/**
 * Route guard: returns a 429 Response when the caller (by IP) has exceeded `bucket`'s limit,
 * or null to proceed. Pass the route's CORS headers so the 429 is reachable cross-origin.
 */
export async function rateLimited(
  req: Request,
  bucket: string,
  opts: { limit: number; windowMs: number },
  extraHeaders?: Record<string, string>,
): Promise<Response | null> {
  const r = await rateLimit(`${bucket}:${clientIp(req)}`, opts);
  return r.ok ? null : tooMany(r.retryAfter, extraHeaders);
}

/**
 * Like `rateLimited` but keyed by an arbitrary identity (e.g. a tenant/site token) instead of IP —
 * for a per-tenant flood cap that holds even when an attacker rotates source IPs. Returns a 429
 * Response when over the limit, else null.
 */
export async function rateLimitedKey(
  key: string,
  opts: { limit: number; windowMs: number },
  extraHeaders?: Record<string, string>,
): Promise<Response | null> {
  const r = await rateLimit(key, opts);
  return r.ok ? null : tooMany(r.retryAfter, extraHeaders);
}
