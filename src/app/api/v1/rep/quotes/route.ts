import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireRep, requireCertifiedRep, AuthError } from "@/lib/auth/session";
import { createQuote, listQuotes, SalesError } from "@/lib/modules/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapError(err: unknown): NextResponse | never {
  if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof ZodError) return NextResponse.json({ error: "validation_error", issues: err.flatten() }, { status: 400 });
  if (err instanceof SalesError) return NextResponse.json({ error: err.code }, { status: err.status });
  throw err;
}

/** GET /api/v1/rep/quotes?prospect= — the rep's quotes. */
export async function GET(req: Request) {
  try {
    const { employee } = await requireRep();
    const prospectId = new URL(req.url).searchParams.get("prospect") ?? undefined;
    const quotes = await listQuotes(employee.id, { prospectId });
    return NextResponse.json({ quotes });
  } catch (err) {
    return mapError(err);
  }
}

/** POST /api/v1/rep/quotes — draft a quote (requires an active contract AND certification). */
export async function POST(req: Request) {
  try {
    const { ctx, employee } = await requireCertifiedRep();
    const body = await req.json().catch(() => null);
    const quote = await createQuote(employee.id, body, { userId: ctx.userId });
    return NextResponse.json({ quote }, { status: 201 });
  } catch (err) {
    return mapError(err);
  }
}
