import { NextResponse } from "next/server";
import { requireRep, AuthError } from "@/lib/auth/session";
import { setPreviewDiscount, SalesError } from "@/lib/modules/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/rep/previews/{id}/discount — set the setup-fee discount + monthly promo (%).
 *  Body: { pct, monthlyPct? } */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { employee } = await requireRep();
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { pct?: number; monthlyPct?: number };
    const result = await setPreviewDiscount(employee.id, id, Number(body.pct ?? 0), Number(body.monthlyPct ?? 0));
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof SalesError) return NextResponse.json({ error: err.code }, { status: err.status });
    throw err;
  }
}
