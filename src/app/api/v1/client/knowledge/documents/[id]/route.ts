import { NextResponse } from "next/server";
import { requireCapability, AuthError } from "@/lib/auth/session";
import { deleteDocument } from "@/lib/modules/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /api/v1/client/knowledge/documents/[id] — remove a knowledge document (tenant-scoped). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let client;
  try {
    ({ client } = await requireCapability("website", "manage"));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  await deleteDocument(client.id, id);
  return NextResponse.json({ ok: true });
}
