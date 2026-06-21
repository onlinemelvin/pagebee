import { NextResponse } from "next/server";
import { requireCapability, AuthError } from "@/lib/auth/session";
import { createDocumentFromBooking, FinanceError, type DocType } from "@/lib/modules/finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/client/bookings/{id}/invoice  body { docType? } — create a draft invoice/estimate
 *  prefilled from the appointment and linked to it. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx, client;
  try {
    ({ ctx, client } = await requireCapability("finance", "manage"));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  void ctx;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { docType?: DocType } | null;
  const docType = body?.docType === "ESTIMATE" || body?.docType === "QUOTE" ? body.docType : "INVOICE";
  try {
    const document = await createDocumentFromBooking(client.id, id, { docType });
    return NextResponse.json({ document }, { status: 201 });
  } catch (err) {
    if (err instanceof FinanceError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[POST /client/bookings/[id]/invoice]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
