import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { PreviewInfo } from "@/lib/modules/client";

/**
 * Compact dashboard card for the preview lifecycle. It does NOT embed the preview itself —
 * when ready it links out to the full /preview review page (where the client views, marks up
 * changes in the footer, and approves to launch).
 */
export function PreviewPanel({ preview }: { preview: PreviewInfo }) {
  if (preview.awaitingPayment) {
    return (
      <section className="rounded-2xl border border-amber-400 bg-amber-50 p-6">
        <h2 className="font-display text-xl text-stone-900">You approved your preview 🎉</h2>
        <p className="mt-1 text-stone-600">
          Pay the one-time setup fee to launch your site, connect your domain, and activate your
          features. (Card payments are connecting soon.)
        </p>
        <Link href="/client/billing" className="mt-4 inline-block">
          <Button size="lg">Go to billing</Button>
        </Link>
      </section>
    );
  }

  // Generating with nothing released yet → calm holding state.
  if (
    !preview.viewable &&
    (preview.status === "PREVIEW_GENERATING" || preview.status === "REVISION_REQUESTED")
  ) {
    return (
      <section className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-center">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-amber-300 border-t-amber-600" />
        <p className="font-medium text-stone-900">Building your preview…</p>
        <p className="mt-1 text-sm text-stone-600">This takes a minute. You can leave and come back.</p>
      </section>
    );
  }

  // Nothing released to show yet.
  if (!preview.viewable && !preview.ready) return null;

  return (
    <section className="rounded-2xl border border-amber-300 bg-amber-50 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl text-stone-900">
          {preview.reviewing ? "Your changes are being reviewed" : "Your free preview is ready"}
        </h2>
      </div>
      <p className="mt-1 text-stone-600">
        {preview.reviewing ? (
          <>
            Your review comments are received — our team is reviewing them (about a 48-hour
            turnaround). You can still view your current preview in the meantime.
          </>
        ) : (
          <>
            Review your website preview and approve it to make it <strong className="font-bold text-amber-600">live</strong>. Want to change something?
            You have <strong>{preview.revisionsLeft}</strong> free revision
            {preview.revisionsLeft === 1 ? "" : "s"} left.
          </>
        )}
      </p>
      <a href="/preview" target="_blank" rel="noreferrer" className="mt-4 inline-block">
        <Button size="lg">View preview ↗</Button>
      </a>
    </section>
  );
}
