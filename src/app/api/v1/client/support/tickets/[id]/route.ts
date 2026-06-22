import { NextResponse } from "next/server";
import { requireClient, AuthError } from "@/lib/auth/session";
import { getTicket, SupportError } from "@/lib/modules/support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/client/support/tickets/{id} — one ticket + its client-visible comments. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth;
  try {
    auth = await requireClient();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  try {
    const ticket = await getTicket(auth.client.id, id);
    return NextResponse.json({ ticket });
  } catch (err) {
    if (err instanceof SupportError) return NextResponse.json({ error: err.code }, { status: err.status });
    throw err;
  }
}
