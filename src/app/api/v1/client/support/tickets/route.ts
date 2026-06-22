import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireClient, AuthError } from "@/lib/auth/session";
import { listTickets, createTicket, SupportError } from "@/lib/modules/support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/client/support/tickets — list the client's own support tickets. */
export async function GET() {
  let auth;
  try {
    auth = await requireClient();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const tickets = await listTickets(auth.client.id);
  return NextResponse.json({ tickets });
}

/** POST /api/v1/client/support/tickets — open a new support ticket. */
export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireClient();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const body = await req.json().catch(() => null);
  try {
    const ticket = await createTicket(auth.client.id, auth.ctx.userId, body);
    return NextResponse.json({ ticket }, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "validation_error", issues: err.flatten() }, { status: 400 });
    if (err instanceof SupportError) return NextResponse.json({ error: err.code }, { status: err.status });
    throw err;
  }
}
