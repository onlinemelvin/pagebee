import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { segmentCount, segmentSchema } from "@/lib/modules/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/admin/email/segment-count — preview recipient count for a segment. */
export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const parsed = segmentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation_error" }, { status: 400 });
  return NextResponse.json({ count: await segmentCount(parsed.data) });
}
