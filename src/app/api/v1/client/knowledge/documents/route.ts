import { NextResponse } from "next/server";
import { requireCapability, AuthError } from "@/lib/auth/session";
import { addDocument, kbKindFor } from "@/lib/modules/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Parsing a PDF/DOCX + (for images) a vision caption runs inline; give it room.
export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024;

/** POST /api/v1/client/knowledge/documents (multipart: file) — upload a doc/image, parse/caption it. */
export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireCapability("website", "manage"));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "missing_file" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "file_too_large" }, { status: 400 });
  if (!kbKindFor(file.type, file.name)) return NextResponse.json({ error: "unsupported_type" }, { status: 400 });

  const result = await addDocument(client.id, { name: file.name, bytes: await file.arrayBuffer(), contentType: file.type });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ document: result }, { status: 201 });
}
