import { NextResponse } from "next/server";
import { z } from "zod";
import { requireClient, AuthError } from "@/lib/auth/session";
import { deleteMedia, setMediaGallery } from "@/lib/modules/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({ inGallery: z.boolean() });

/** PATCH /api/v1/client/media/{id} — update whether an image shows in the public gallery. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.flatten() }, { status: 400 });
  }
  const { id } = await params;
  const ok = await setMediaGallery(client.id, id, parsed.data.inGallery);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

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
