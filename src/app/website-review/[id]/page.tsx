import { redirect, notFound } from "next/navigation";
import { requireReview, AuthError } from "@/lib/auth/session";
import { getVersionDetail } from "@/lib/modules/website";
import { listComments } from "@/lib/modules/review";
import { AdminPreviewReview } from "@/components/admin/AdminPreviewReview";

export const dynamic = "force-dynamic";

/**
 * GET /website-review/{versionId} — full-screen admin review of a version (chrome-free, no admin
 * sidebar — same as the client's /preview). Needs website:review. Linked from the detail page.
 */
export default async function WebsiteReviewPage({ params }: { params: Promise<{ id: string }> }) {
  try {
    await requireReview();
  } catch (err) {
    if (err instanceof AuthError) redirect("/login");
    throw err;
  }

  const { id } = await params;
  const [version, comments] = await Promise.all([getVersionDetail(id), listComments(id)]);
  if (!version) notFound();

  return (
    <AdminPreviewReview
      versionId={version.id}
      published={version.status === "PUBLISHED"}
      comments={comments}
    />
  );
}
