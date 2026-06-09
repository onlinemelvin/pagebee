"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function PublishButton({ versionId, published }: { versionId: string; published: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function approve() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/websites/${versionId}/approve`, { method: "POST" });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  if (published) {
    return <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-800">Published</span>;
  }

  return (
    <div className="flex items-center gap-3">
      <Button onClick={approve} disabled={loading}>
        {loading ? "Publishing…" : "Approve & publish"}
      </Button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
