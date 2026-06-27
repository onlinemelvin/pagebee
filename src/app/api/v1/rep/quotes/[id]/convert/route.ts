import { NextResponse } from "next/server";
import { requireContractedRep, AuthError } from "@/lib/auth/session";
import { convertQuoteToClient, SalesError } from "@/lib/modules/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/rep/quotes/{id}/convert — turn an accepted quote into an attributed paying client. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { ctx, employee } = await requireContractedRep();
    const { id } = await params;
    const result = await convertQuoteToClient(employee.id, id, { userId: ctx.userId });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof SalesError) return NextResponse.json({ error: err.code }, { status: err.status });
    // registerClient throws RegistrationError (e.g. email_taken) with status + code
    const e = err as { status?: number; code?: string };
    if (typeof e?.status === "number" && typeof e?.code === "string") {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    throw err;
  }
}
