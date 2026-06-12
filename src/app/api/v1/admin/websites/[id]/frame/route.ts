import { requireReview, AuthError } from "@/lib/auth/session";
import { getVersionFrameData } from "@/lib/modules/website";
import { serveReviewFrame } from "@/lib/site/serve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/admin/websites/{versionId}/frame — the version rendered for annotation (iframe src). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireReview();
  } catch (err) {
    if (err instanceof AuthError) return new Response(err.message, { status: err.status });
    throw err;
  }
  const { id } = await params;
  const data = await getVersionFrameData(id);
  if (!data) return new Response("not found", { status: 404 });
  return serveReviewFrame(data.html, data.siteToken, req);
}
