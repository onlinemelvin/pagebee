import { NextResponse } from "next/server";
import { requireCapability, AuthError } from "@/lib/auth/session";
import { createCustomer, listCustomers, customerCounts, CustomerError } from "@/lib/modules/customer";
import { ZodError } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/client/customers?q=&archived=1 — list the caller's contacts (+ active/archived counts). */
export async function GET(req: Request) {
  let client;
  try {
    ({ client } = await requireCapability("customers", "view"));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const url = new URL(req.url);
  const search = url.searchParams.get("q") ?? undefined;
  const archived = url.searchParams.get("archived") === "1";
  const [customers, counts] = await Promise.all([
    listCustomers(client.id, { search, archived }),
    customerCounts(client.id),
  ]);
  return NextResponse.json({ customers, counts });
}

/** POST /api/v1/client/customers — manually add a contact. */
export async function POST(req: Request) {
  let ctx, client;
  try {
    ({ ctx, client } = await requireCapability("customers", "manage"));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const body = await req.json().catch(() => null);
  try {
    const customer = await createCustomer(client.id, body, { userId: ctx.userId });
    return NextResponse.json({ customer }, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "validation_error", issues: err.flatten() }, { status: 400 });
    if (err instanceof CustomerError) return NextResponse.json({ error: err.code }, { status: err.status });
    throw err;
  }
}
