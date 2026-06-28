import { NextResponse } from "next/server";
import { requireRep, AuthError } from "@/lib/auth/session";
import { listRepResources } from "@/lib/modules/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/rep/resources — the enablement library, grouped. */
export async function GET() {
  try {
    await requireRep();
    const groups = await listRepResources();
    return NextResponse.json({ groups });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
