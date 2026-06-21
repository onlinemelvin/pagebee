// Supabase Storage via REST + service-role key (server-only). Mirrors admin.ts's
// approach of avoiding @supabase/supabase-js. Uploads client logos/photos to a
// public bucket and returns the public URL.

import { randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

const BUCKET = "client-uploads";

/** True for loopback / private / link-local / reserved IPs we must never fetch (SSRF). */
function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^::ffff:/, ""); // unwrap IPv4-mapped IPv6
  if (isIP(v) === 4) {
    const [a, b] = v.split(".").map(Number);
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) || // link-local (incl. cloud metadata 169.254.169.254)
      a >= 224 // multicast / reserved
    );
  }
  // IPv6: loopback, unspecified, unique-local (fc00::/7), link-local (fe80::/10).
  return v === "::1" || v === "::" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
}

/**
 * Resolve a user-supplied URL and reject it if it targets a private/reserved
 * host — blocks SSRF to cloud metadata, localhost, and internal services before
 * we fetch. Only http(s) is allowed. (Residual: redirect-time DNS rebinding is
 * not covered; fetch below could still be hardened with a pinned dispatcher.)
 */
async function assertPublicHttpUrl(raw: string): Promise<void> {
  const u = new URL(raw);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("ssrf_blocked_scheme");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (addrs.length === 0 || addrs.some(isPrivateIp)) throw new Error("ssrf_blocked_host");
}
const MAX_IMAGE_BYTES = 5_242_880; // matches the bucket's file_size_limit

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

function cfg() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return { url, serviceKey };
}

let bucketReady = false;
async function ensureBucket(url: string, serviceKey: string) {
  if (bucketReady) return;
  // Idempotent: ignore "already exists".
  await fetch(`${url}/storage/v1/bucket`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: 5_242_880 }),
  }).catch(() => {});
  bucketReady = true;
}

/** Upload bytes to the public bucket at `path`; returns the public URL (or null). */
export async function uploadPublicFile(
  path: string,
  bytes: ArrayBuffer,
  contentType: string,
): Promise<string | null> {
  const c = cfg();
  if (!c) return null;
  await ensureBucket(c.url, c.serviceKey);

  const res = await fetch(`${c.url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: {
      apikey: c.serviceKey,
      Authorization: `Bearer ${c.serviceKey}`,
      "x-upsert": "true",
    },
    body: new Blob([bytes], { type: contentType }),
  });
  if (!res.ok) {
    console.error("[storage] upload failed", res.status, await res.text().catch(() => ""));
    return null;
  }
  return `${c.url}/storage/v1/object/public/${BUCKET}/${path}`;
}

/**
 * Download a remote image and re-host it in our public bucket so the generated site doesn't
 * break if the source (e.g. Pexels) later removes it. Returns our public URL, or null on any
 * failure — callers should fall back to the original URL (a maybe-future-broken link still
 * beats no image now). Storage must be configured; otherwise null.
 */
export async function persistRemoteImage(clientId: string, remoteUrl: string): Promise<string | null> {
  if (!cfg()) return null;
  try {
    await assertPublicHttpUrl(remoteUrl); // SSRF guard — reject private/reserved hosts
    const res = await fetch(remoteUrl, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!type.startsWith("image/")) return null;
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null;
    const ext = EXT_BY_TYPE[type] ?? "jpg";
    const path = `${clientId}/stock/${randomBytes(8).toString("hex")}.${ext}`;
    return await uploadPublicFile(path, bytes, type);
  } catch (err) {
    console.error("[storage] persistRemoteImage failed:", (err as Error)?.message);
    return null;
  }
}
