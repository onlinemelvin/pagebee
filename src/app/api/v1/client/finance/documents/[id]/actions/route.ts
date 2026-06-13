import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireClient, AuthError } from "@/lib/auth/session";
import {
  sendDocument,
  convertDocument,
  decideDocument,
  recordManualPayment,
  FinanceError,
  type DocType,
} from "@/lib/modules/finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/client/finance/documents/{id}/actions — lifecycle actions on a document.
 * Body: { action: "send" } | { action: "convert", toType } | { action: "decision", decision }
 *       | { action: "payment", amount, note? }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;
  try {
    let document;
    switch (action) {
      case "send":
        document = await sendDocument(client.id, id);
        break;
      case "convert":
        document = await convertDocument(client.id, id, body!.toType as DocType);
        break;
      case "decision":
        document = await decideDocument(client.id, id, body!.decision === "ACCEPTED" ? "ACCEPTED" : "DECLINED");
        break;
      case "payment":
        document = await recordManualPayment(client.id, id, body);
        break;
      default:
        return NextResponse.json({ error: "unknown_action" }, { status: 400 });
    }
    return NextResponse.json({ document });
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "validation_error", issues: err.flatten() }, { status: 400 });
    if (err instanceof FinanceError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[POST /finance/documents/[id]/actions]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
