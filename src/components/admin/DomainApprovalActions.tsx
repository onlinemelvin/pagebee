"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * Admin approve/reject for a requested custom domain. Approving adds it to the Vercel project and
 * surfaces the DNS records to the client; rejecting clears it so the owner can submit another.
 * Mirrors ReleaseButton — the admin is the gate before anything touches Vercel.
 */
export function DomainApprovalActions({ websiteId, status }: { websiteId: string; status: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"approve" | "reject" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function approve() {
    setBusy("approve");
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/domains/${websiteId}`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(data?.message ?? `Failed (${res.status})`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    const reason = window.prompt("Reason for rejecting this domain? (optional, shown to the client)") ?? undefined;
    setBusy("reject");
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/domains/${websiteId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  // Once approved (verifying) or live, there's nothing to approve — the cron handles activation.
  // Keep a reject/detach path available for verifying (e.g. a domain that should never have passed).
  const canApprove = status === "requested" || status === "error";

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {canApprove && (
        <Button onClick={approve} disabled={busy !== null} variant="primary" size="sm">
          {busy === "approve" ? "Approving…" : "Approve"}
        </Button>
      )}
      <Button onClick={reject} disabled={busy !== null} variant="outline" size="sm">
        {busy === "reject" ? "Rejecting…" : "Reject"}
      </Button>
      {error && <span className="w-full text-right text-xs text-red-600">{error}</span>}
    </div>
  );
}
