import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireClient, AuthError } from "@/lib/auth/session";
import { listDocuments, createDocument, FinanceError, type DocType } from "@/lib/modules/finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/client/finance/documents?docType=&status= — list the caller's documents. */
export async function GET(req: Request) {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const url = new URL(req.url);
  const docType = url.searchParams.get("docType") as DocType | null;
  const documents = await listDocuments(client.id, { docType: docType ?? undefined });
  return NextResponse.json({ documents });
}

/** POST /api/v1/client/finance/documents — create an estimate, quote, or invoice (DRAFT). */
export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const body = await req.json().catch(() => null);
  try {
    const document = await createDocument(client.id, body);
    return NextResponse.json({ document }, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "validation_error", issues: err.flatten() }, { status: 400 });
    if (err instanceof FinanceError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[POST /finance/documents]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
