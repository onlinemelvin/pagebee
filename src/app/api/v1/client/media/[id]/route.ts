import { NextResponse } from "next/server";
import { requireClient, AuthError } from "@/lib/auth/session";
import { deleteMedia } from "@/lib/modules/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /api/v1/client/media/{id} — remove an item from the client's library. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  const ok = await deleteMedia(client.id, id);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
