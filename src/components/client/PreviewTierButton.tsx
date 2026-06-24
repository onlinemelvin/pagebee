"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Triggers a FREE preview of a higher tier: regenerates the site at `plan` (reusing the last intake)
 * and sends the owner to the website page to watch it build / review it. No charge — payment only
 * happens later at Approve & launch. Used by UpgradeGate (locked features) and the plan grid.
 */
export function PreviewTierButton({
  plan,
  label,
  className,
  variant = "solid",
}: {
  plan: string;
  label?: string;
  className?: string;
  variant?: "solid" | "subtle";
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/client/website/preview-tier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(
          d?.error === "no_prior_generation"
            ? "Generate your website first, then you can preview other tiers."
            : "Couldn't start the preview — please try again.",
        );
        setBusy(false);
        return;
      }
      router.push("/client/website"); // shows the generation progress → preview
    } catch {
      setError("Couldn't start the preview — please try again.");
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        onClick={go}
        disabled={busy}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm transition disabled:opacity-60",
          variant === "subtle"
            ? "border border-stone-200 bg-white text-stone-700 shadow-none hover:bg-stone-50"
            : "bg-stone-900 text-white hover:bg-stone-800",
          className,
        )}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
        {busy ? "Building your preview…" : (label ?? `See it on ${plan} — free preview`)}
      </button>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
    </div>
  );
}
