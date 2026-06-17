import { NextResponse } from "next/server";
import { rateLimited } from "@/lib/ratelimit";
import { getPublicDocumentPdf } from "@/lib/modules/finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/public/finance/{token}/pdf — customer downloads their document as PDF. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const limited = await rateLimited(req, "finance-pdf", { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const { token } = await params;
  try {
    const result = await getPublicDocumentPdf(token);
    if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return new Response(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${result.filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[GET /public/finance/pdf]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
