import { NextResponse } from "next/server";
import { requireClient, AuthError } from "@/lib/auth/session";
import { generateForClient, websiteIntakeSchema } from "@/lib/modules/website";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/client/website/generate — generate a website draft for the caller's tenant. */
export async function POST(req: Request) {
  let client;
  try {
    ({ client } = await requireClient());
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = await req.json().catch(() => ({}));
  const parsed = websiteIntakeSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await generateForClient(client.id, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("[POST /api/v1/client/website/generate]", err);
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
  }
}
