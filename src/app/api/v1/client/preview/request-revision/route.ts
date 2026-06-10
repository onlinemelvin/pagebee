import { NextResponse } from "next/server";
import { z } from "zod";
import { requireClient, AuthError } from "@/lib/auth/session";
import { requestRevision, PreviewError } from "@/lib/modules/preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ note: z.string().trim().min(1).max(2000) });

/** POST /api/v1/client/preview/request-revision — use the one free revision. */
export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await requestRevision(client.id, parsed.data.note);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof PreviewError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("[POST /api/v1/client/preview/request-revision]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
