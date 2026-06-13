import { NextResponse } from "next/server";
import { requireClient, AuthError } from "@/lib/auth/session";
import { uploadIdentityDocument, PaymentError } from "@/lib/modules/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED = ["image/jpeg", "image/png", "application/pdf"];

/** POST (multipart) — upload an identity document. Fields: file, side=front|back. */
export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }
  const file = form.get("file");
  const side = form.get("side") === "back" ? "back" : "front";
  if (!(file instanceof File)) return NextResponse.json({ error: "file_required" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "file_too_large" }, { status: 400 });
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: "unsupported_type" }, { status: 400 });

  try {
    const data = Buffer.from(await file.arrayBuffer());
    const state = await uploadIdentityDocument(client.id, side, { data, name: file.name || "document", type: file.type });
    return NextResponse.json({ state });
  } catch (err) {
    if (err instanceof PaymentError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[POST /payments/document]", err);
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}
