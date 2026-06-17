"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * Admin review action. The admin's only act on a draft is to RELEASE it to the client
 * for review (sets config.adminReviewed) — going live is the client's own payment-gated
 * "Approve & launch" (see PreviewPanel → /api/v1/client/preview/approve). The admin never
 * publishes the site live directly.
 */
export function ReleaseButton({
  versionId,
  published,
  released = false,
  isLiveUpdate = false,
}: {
  versionId: string;
  /** The site is already live (only reachable via the client's Approve & launch). */
  published: boolean;
  /** Whether this draft has been released to the client (config.adminReviewed). */
  released?: boolean;
  /** This draft is an update to an ALREADY-LIVE site → release it to the client to approve. */
  isLiveUpdate?: boolean;
}) {
  const router = useRouter();
  const [releasing, setReleasing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function release() {
    setReleasing(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/websites/${versionId}/release`, { method: "POST" });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setReleasing(false);
    }
  }

  if (published) {
    return <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-800">Published</span>;
  }

  if (released) {
    return (
      <span className="rounded-full bg-sky-100 px-3 py-1 text-sm font-semibold text-sky-800">
        Released to client ✓ — awaiting their {isLiveUpdate ? "update approval" : "approval"}
      </span>
    );
  }

  // Both first previews and updates to a live site are released to the client, who approves
  // (a launch, or a republish for updates). The admin never publishes the client's site directly.
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={release} disabled={releasing} variant="primary">
        {releasing ? "Releasing…" : isLiveUpdate ? "Release update to client" : "Release to client"}
      </Button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
