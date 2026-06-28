import { NextResponse } from "next/server";
import { requireRep, AuthError } from "@/lib/auth/session";
import { getQuote, SalesError } from "@/lib/modules/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/rep/quotes/{id} — one of the rep's quotes. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { employee } = await requireRep();
    const { id } = await params;
    const quote = await getQuote(employee.id, id);
    return NextResponse.json({ quote });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof SalesError) return NextResponse.json({ error: err.code }, { status: err.status });
    throw err;
  }
}
