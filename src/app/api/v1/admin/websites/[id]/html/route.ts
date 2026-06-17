import { NextResponse } from "next/server";
import { requireReview, AuthError } from "@/lib/auth/session";
import { getVersionRawHtml } from "@/lib/modules/website";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/admin/websites/{versionId}/html — the raw generated HTML, for the manual editor. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireReview();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { id } = await params;
  const html = await getVersionRawHtml(id);
  if (html == null) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ html });
}
