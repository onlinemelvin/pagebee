import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireRep, AuthError } from "@/lib/auth/session";
import { signContract, SalesError } from "@/lib/modules/sales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/rep/contract/sign — rep e-signs their agreement (activates it). */
export async function POST(req: Request) {
  try {
    const { ctx, employee } = await requireRep();
    const body = await req.json().catch(() => null);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const contract = await signContract(employee.id, body, { userId: ctx.userId, ip });
    return NextResponse.json({ contract });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof ZodError) return NextResponse.json({ error: "validation_error", issues: err.flatten() }, { status: 400 });
    if (err instanceof SalesError) return NextResponse.json({ error: err.code }, { status: err.status });
    throw err;
  }
}
