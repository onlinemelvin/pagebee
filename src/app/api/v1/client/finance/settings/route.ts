import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireClient, AuthError } from "@/lib/auth/session";
import { getFinanceSettings, saveFinanceSettings } from "@/lib/modules/finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  return NextResponse.json({ settings: await getFinanceSettings(client.id) });
}

export async function PUT(req: Request) {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const body = await req.json().catch(() => null);
  try {
    const settings = await saveFinanceSettings(client.id, body);
    return NextResponse.json({ settings });
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "validation_error", issues: err.flatten() }, { status: 400 });
    console.error("[PUT /finance/settings]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
