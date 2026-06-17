import { NextResponse } from "next/server";
import { requireClient, AuthError } from "@/lib/auth/session";
import { getDocumentPdf, FinanceError } from "@/lib/modules/finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/client/finance/documents/{id}/pdf — owner downloads a document as PDF. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  try {
    const { buffer, filename } = await getDocumentPdf(client.id, id);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof FinanceError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[GET finance document pdf]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
