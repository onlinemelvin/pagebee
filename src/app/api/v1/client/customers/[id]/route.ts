import { NextResponse } from "next/server";
import { requireCapability, AuthError } from "@/lib/auth/session";
import { getCustomer, updateCustomer, deleteCustomer, CustomerError } from "@/lib/modules/customer";
import { ZodError } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapError(err: unknown): NextResponse | never {
  if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof ZodError) return NextResponse.json({ error: "validation_error", issues: err.flatten() }, { status: 400 });
  if (err instanceof CustomerError) return NextResponse.json({ error: err.code }, { status: err.status });
  throw err;
}

/** GET /api/v1/client/customers/{id} — one contact (tenant-scoped). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { client } = await requireCapability("customers", "view");
    const { id } = await params;
    const customer = await getCustomer(client.id, id);
    if (!customer) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ customer });
  } catch (err) {
    return mapError(err);
  }
}

/** PATCH /api/v1/client/customers/{id} — update a contact. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { ctx, client } = await requireCapability("customers", "manage");
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const customer = await updateCustomer(client.id, id, body, { userId: ctx.userId });
    return NextResponse.json({ customer });
  } catch (err) {
    return mapError(err);
  }
}

/** DELETE /api/v1/client/customers/{id} — permanently remove a contact (blocked if it has invoices/payments). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { ctx, client } = await requireCapability("customers", "manage");
    const { id } = await params;
    await deleteCustomer(client.id, id, { userId: ctx.userId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mapError(err);
  }
}
