import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireClient, AuthError } from "@/lib/auth/session";
import { updateService, deleteService, ServiceError } from "@/lib/modules/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/v1/client/services/{id} — update a service in the catalog. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);
  try {
    const service = await updateService(client.id, id, body);
    return NextResponse.json({ service });
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "validation_error", issues: err.flatten() }, { status: 400 });
    if (err instanceof ServiceError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[PATCH /api/v1/client/services/[id]]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

/** DELETE /api/v1/client/services/{id} — remove a service (the "Other" default cannot be deleted). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  try {
    await deleteService(client.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[DELETE /api/v1/client/services/[id]]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
