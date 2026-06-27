import { NextResponse } from "next/server";
import { requireCapability, AuthError } from "@/lib/auth/session";
import { getKnowledge, setKnowledge, knowledgeUpdateSchema } from "@/lib/modules/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/client/knowledge — curated fields + uploaded documents the AI reads. */
export async function GET() {
  let client;
  try {
    ({ client } = await requireCapability("website", "view"));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  return NextResponse.json(await getKnowledge(client.id), { headers: { "Cache-Control": "no-store" } });
}

/** PUT /api/v1/client/knowledge — update the curated structured fields (about/details/policies/faqs). */
export async function PUT(req: Request) {
  let client;
  try {
    ({ client } = await requireCapability("website", "manage"));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const parsed = knowledgeUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation_error", issues: parsed.error.flatten() }, { status: 400 });
  return NextResponse.json({ data: await setKnowledge(client.id, parsed.data) });
}
