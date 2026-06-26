"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Rocket } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Approve the released preview and launch (shown next to "View your preview" once the preview is
 * ready). Confirms in a modal so a dashboard click can't accidentally launch the site. Test
 * accounts go live immediately; real accounts move to the setup-fee step. Mirrors the approve
 * action on the full-screen preview review.
 */
export function ApproveLaunchButton({ isUpdate = false }: { isUpdate?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const cta = isUpdate ? "Approve & update" : "Approve & launch";

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/client/preview/approve", { method: "POST" });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(b?.error ?? `Failed (${res.status})`);
      }
      const result = (await res.json().catch(() => ({}))) as { launched?: boolean; awaitingPayment?: boolean };

      // Real accounts: approval moves to the setup-fee step — send them to the dedicated launch page,
      // which summarizes the setup fee + first month and continues to Stripe. The webhook launches
      // the site once payment succeeds.
      if (result.awaitingPayment) {
        router.push("/client/launch");
        return;
      }

      // Test accounts / setup fee disabled: launched immediately.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className={cn(buttonVariants({ variant: "dark", size: "sm" }))}
      >
        <Rocket size={16} /> {cta}
      </button>

      {open && mounted &&
        createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/50 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={() => !busy && setOpen(false)}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700">
                <Rocket size={18} />
              </span>
              <div>
                <h2 className="font-display text-lg text-stone-900">
                  {isUpdate ? "Publish this update to your live site?" : "Approve & launch your site?"}
                </h2>
                <p className="mt-1.5 text-sm text-stone-600">
                  {isUpdate
                    ? "This replaces your live site with the preview you've approved. It goes live right away."
                    : "This publishes the preview you've approved and takes you through any remaining setup. You can't undo a launch."}
                </p>
              </div>
            </div>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button disabled={busy} onClick={approve}>
                <Rocket size={16} /> {busy ? (isUpdate ? "Updating…" : "Launching…") : cta}
              </Button>
            </div>
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}
