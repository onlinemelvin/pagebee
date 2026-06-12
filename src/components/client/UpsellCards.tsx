"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { UpgradeModal } from "./UpgradeModal";
import type { UpsellItem } from "@/lib/modules/client";

/** Dashboard upsell cards (e.g. "Add online booking — upgrade to Connect"). */
export function UpsellCards({ upsells }: { upsells: UpsellItem[] }) {
  const [active, setActive] = React.useState<UpsellItem | null>(null);
  if (upsells.length === 0) return null;

  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-400">Grow your site</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {upsells.map((u) => (
          <div
            key={u.reason}
            className="flex flex-col justify-between rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5"
          >
            <div>
              <p className="font-display text-lg text-stone-900">{u.title}</p>
              <p className="mt-1 text-sm text-stone-600">{u.desc}</p>
            </div>
            <Button className="mt-4 self-start" onClick={() => setActive(u)}>
              {u.ctaLabel}
            </Button>
          </div>
        ))}
      </div>

      <UpgradeModal
        open={active !== null}
        onClose={() => setActive(null)}
        toPlan={active?.toPlan ?? ""}
        reason={active?.reason}
      />
    </section>
  );
}
