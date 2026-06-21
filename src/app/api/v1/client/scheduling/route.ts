import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireCapability, AuthError } from "@/lib/auth/session";
import { getSchedulingSettings, saveSchedulingSettings } from "@/lib/modules/booking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/client/scheduling — the caller's availability settings (normalized w/ defaults). */
export async function GET() {
  let client;
  try {
    ({ client } = await requireCapability("appointments", "view"));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const settings = await getSchedulingSettings(client.id);
  return NextResponse.json({ settings });
}

/** PUT /api/v1/client/scheduling — replace the caller's availability settings. */
export async function PUT(req: Request) {
  let client;
  try {
    ({ client } = await requireCapability("appointments", "manage"));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const body = await req.json().catch(() => null);
  try {
    const settings = await saveSchedulingSettings(client.id, body);
    return NextResponse.json({ settings });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "validation_error", issues: err.flatten() }, { status: 400 });
    }
    console.error("[PUT /api/v1/client/scheduling]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
