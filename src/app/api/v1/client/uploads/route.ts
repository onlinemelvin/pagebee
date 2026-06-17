import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireClient, AuthError } from "@/lib/auth/session";
import { uploadPublicFile } from "@/lib/supabase/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

/** POST /api/v1/client/uploads (multipart: file) — upload a logo/photo, returns { url }. */
export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireClient());
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
  const path = `${client.id}/${randomBytes(8).toString("hex")}.${ext}`;
  const bytes = await file.arrayBuffer();

  const url = await uploadPublicFile(path, bytes, file.type);
  if (!url) return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  return NextResponse.json({ url });
}
