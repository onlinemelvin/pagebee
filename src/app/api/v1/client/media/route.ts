import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireCapability, AuthError } from "@/lib/auth/session";
import { uploadPublicFile } from "@/lib/supabase/storage";
import { listMedia, addMedia } from "@/lib/modules/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

async function client(action: "view" | "manage") {
  const { client } = await requireCapability("website", action);
  return client;
}

/** GET /api/v1/client/media — the signed-in client's reusable media library. */
export async function GET() {
  let c;
  try {
    c = await client("view");
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  return NextResponse.json({ items: await listMedia(c.id) });
}

/** POST /api/v1/client/media (multipart: file, optional name/alt) — upload to the library. */
export async function POST(req: Request) {
  let c;
  try {
    c = await client("manage");
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "missing_file" }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "invalid_type" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "file_too_large" }, { status: 400 });

  const ext = (file.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "png";
  const path = `${c.id}/media/${randomBytes(8).toString("hex")}.${ext}`;
  const bytes = await file.arrayBuffer();

  const url = await uploadPublicFile(path, bytes, file.type);
  if (!url) return NextResponse.json({ error: "upload_failed" }, { status: 500 });

  const name = (form?.get("name") as string | null)?.toString().slice(0, 200) || file.name.slice(0, 200);
  const alt = (form?.get("alt") as string | null)?.toString().slice(0, 300) || null;
  const item = await addMedia(c.id, { url, name, alt, kind: "image" });
  return NextResponse.json({ item }, { status: 201 });
}
