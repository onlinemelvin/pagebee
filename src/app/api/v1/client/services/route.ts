import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireCapability, AuthError } from "@/lib/auth/session";
import { listServices, createService, ServiceError } from "@/lib/modules/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/client/services — the caller's full service catalog. */
export async function GET() {
  let client;
  try {
    ({ client } = await requireCapability("website", "view"));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const services = await listServices(client.id);
  return NextResponse.json({ services });
}

/** POST /api/v1/client/services — add a service to the catalog. */
export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireCapability("website", "manage"));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const body = await req.json().catch(() => null);
  try {
    const service = await createService(client.id, body);
    return NextResponse.json({ service }, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) return NextResponse.json({ error: "validation_error", issues: err.flatten() }, { status: 400 });
    if (err instanceof ServiceError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[POST /api/v1/client/services]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
