import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireRep, requireContractedRep, AuthError } from "@/lib/auth/session";
import { createProspect, listProspects, SalesError } from "@/lib/modules/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapError(err: unknown): NextResponse | never {
  if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof ZodError) return NextResponse.json({ error: "validation_error", issues: err.flatten() }, { status: 400 });
  if (err instanceof SalesError) return NextResponse.json({ error: err.code }, { status: err.status });
  throw err;
}

/** GET /api/v1/rep/prospects?q=&status= — the rep's own prospects. */
export async function GET(req: Request) {
  try {
    const { employee } = await requireRep();
    const url = new URL(req.url);
    const prospects = await listProspects(employee.id, {
      search: url.searchParams.get("q") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });
    return NextResponse.json({ prospects });
  } catch (err) {
    return mapError(err);
  }
}

/** POST /api/v1/rep/prospects — add a prospect (requires an active signed contract). */
export async function POST(req: Request) {
  try {
    const { ctx, employee } = await requireContractedRep();
    const body = await req.json().catch(() => null);
    const prospect = await createProspect(employee.id, body, { userId: ctx.userId });
    return NextResponse.json({ prospect }, { status: 201 });
  } catch (err) {
    return mapError(err);
  }
}
