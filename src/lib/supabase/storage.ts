// Supabase Storage via REST + service-role key (server-only). Mirrors admin.ts's
// approach of avoiding @supabase/supabase-js. Uploads client logos/photos to a
// public bucket and returns the public URL.

const BUCKET = "client-uploads";

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
