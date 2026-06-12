"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnnotatablePreview } from "@/components/review/AnnotatablePreview";
import type { ReviewCommentDTO } from "@/lib/modules/review";

/**
 * Full-screen admin review surface (chrome-free, like the client's /preview). The preview fills
 * the viewport and the yellow footer carries the review controls: comment mode, add comment, and
 * "Request changes & regenerate". Linked from the website detail page's "Open fullscreen".
 */
export function AdminPreviewReview({
  versionId,
  published,
  comments,
}: {
  versionId: string;
  published: boolean;
  comments: ReviewCommentDTO[];
}) {
  const router = useRouter();
  const apiBase = `/api/v1/admin/websites/${versionId}`;

  const footerStart = (
    <Link
      href={`/admin/websites/${versionId}`}
      className="inline-flex items-center rounded-md bg-stone-900/85 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-stone-900"
    >
      ← Back to review
    </Link>
  );

  return (
    <div className="flex h-screen flex-col">
      <AnnotatablePreview
        frameSrc={`${apiBase}/frame`}
        apiBase={apiBase}
        initialComments={comments}
        canComment={!published}
        canResolve
        deletePolicy="all"
        requestChangesUrl={published ? undefined : `${apiBase}/request-changes`}
        requestChangesLabel="Request changes & regenerate"
        onRequested={() => router.refresh()}
        bannerBadge={published ? "PUBLISHED" : "REVIEW"}
        bannerMessage={
          published ? "This site is live." : "Right-click any part of the page to pin a change."
        }
        defaultCommenting={!published}
        bordered={false}
        className="h-full"
        footerStart={footerStart}
      />
    </div>
  );
}
