import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireCapability, AuthError } from "@/lib/auth/session";
import { listStatements, generateStatement, assertFinanceEnabled, FinanceError } from "@/lib/modules/finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  customerId: z.string().min(1),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
});

/** GET /api/v1/client/finance/statements[?customerId=] — list generated statements. */
export async function GET(req: Request) {
  let client;
  try {
    ({ client } = await requireCapability("finance", "view"));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  try {
    await assertFinanceEnabled(client.id);
    const customerId = new URL(req.url).searchParams.get("customerId") ?? undefined;
    const statements = await listStatements(client.id, customerId);
    return NextResponse.json({ statements });
  } catch (err) {
    if (err instanceof FinanceError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

/** POST /api/v1/client/finance/statements — generate a statement for a customer + period. */
export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireCapability("finance", "manage"));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const body = await req.json().catch(() => null);
  try {
    await assertFinanceEnabled(client.id);
    const { customerId, periodStart, periodEnd } = createSchema.parse(body);
    if (periodEnd < periodStart) return NextResponse.json({ error: "invalid_period" }, { status: 400 });
    const statement = await generateStatement(client.id, customerId, periodStart, periodEnd);
    return NextResponse.json({ statement }, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "validation_error", issues: err.flatten() }, { status: 400 });
    if (err instanceof FinanceError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
