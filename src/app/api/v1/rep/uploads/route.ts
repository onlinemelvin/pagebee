import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireContractedRep, AuthError } from "@/lib/auth/session";
import { uploadPublicFile } from "@/lib/supabase/storage";
import { assertRepAssignedToProspect, SalesError } from "@/lib/modules/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * POST /api/v1/rep/uploads (multipart: file, prospectId) — a contracted rep uploads a logo/photo for a
 * prospect's free preview, returns { url }. Mirrors /api/v1/client/uploads, but tenancy is the rep's
 * assignment to the prospect rather than a client session (the provisional client doesn't exist until
 * the preview is requested). Files land under previews/{prospectId}/.
 */
export async function POST(req: Request) {
  let prospectId: string;
  try {
    const { employee } = await requireContractedRep();
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    prospectId = String(form?.get("prospectId") ?? "");
    if (!prospectId) return NextResponse.json({ error: "missing_prospect" }, { status: 400 });
    await assertRepAssignedToProspect(employee.id, prospectId);

    if (!(file instanceof File)) return NextResponse.json({ error: "missing_file" }, { status: 400 });
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "invalid_type" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "file_too_large" }, { status: 400 });

    const ext = (file.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "png";
    const path = `previews/${prospectId}/${randomBytes(8).toString("hex")}.${ext}`;
    const bytes = await file.arrayBuffer();

    const url = await uploadPublicFile(path, bytes, file.type);
    if (!url) return NextResponse.json({ error: "upload_failed" }, { status: 500 });
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof SalesError) return NextResponse.json({ error: err.code }, { status: err.status });
    throw err;
  }
}
