import { redirect } from "next/navigation";
import Link from "next/link";
import { getClientWorkspace } from "@/lib/modules/client";
import { ClientPreviewReview } from "@/components/client/ClientPreviewReview";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/**
 * GET /preview — the signed-in client's preview review surface. The dashboard links here
 * ("View preview") rather than embedding the preview inline. Renders the live preview with
 * the comment toggle in its footer, plus approve & launch / revision actions.
 */
export default async function PreviewPage() {
  const ws = await getClientWorkspace();
  if (!ws) redirect("/login");

  // Already live → send to the real site.
  if (ws.preview.live && ws.preview.url) redirect(ws.preview.url);
  // Nothing has been released yet (still generating, never reviewed) → back to the dashboard's
  // "we're setting up your website" holding state. Once any version is released the preview stays
  // viewable — even while a newer revision is being reviewed.
  if (!ws.preview.viewable && !ws.preview.awaitingPayment) redirect("/client/website");

  if (ws.preview.awaitingPayment) {
    return (
      <div className="grid min-h-screen place-items-center bg-stone-50 px-4">
        <div className="max-w-md rounded-2xl border border-amber-400 bg-amber-50 p-8 text-center">
          <h1 className="font-display text-2xl text-stone-900">You approved your preview 🎉</h1>
          <p className="mt-2 text-stone-600">
            Complete your one-time setup payment to launch your site, connect your domain, and activate
            your features. Secure checkout by Stripe — your site goes live as soon as you pay.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <Link href="/client/launch">
              <Button size="lg">Pay &amp; launch ↗</Button>
            </Link>
            <Link href="/client">
              <Button size="lg" variant="ghost">
                Back to dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ClientPreviewReview
      canComment={ws.preview.canComment}
      revisionsLeft={ws.preview.revisionsLeft}
      planName={ws.planName}
      reviewing={ws.preview.reviewing}
    />
  );
}
