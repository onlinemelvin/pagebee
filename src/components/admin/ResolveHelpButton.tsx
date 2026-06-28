"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/** Marks a rep help ticket resolved from the admin Help inbox. */
export function ResolveHelpButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  async function resolve() {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/admin/help/${id}/resolve`, { method: "POST" });
      if (res.ok) {
        toast.success("Marked resolved");
        router.refresh();
      } else {
        toast.error("Could not resolve");
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button size="sm" variant="outline" onClick={resolve} disabled={busy}>
      <Check size={14} /> Resolve
    </Button>
  );
}
