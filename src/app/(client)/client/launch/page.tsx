import { redirect } from "next/navigation";
import Link from "next/link";
import { Rocket, Check, ExternalLink, ShieldCheck } from "lucide-react";
import { getClientWorkspace } from "@/lib/modules/client";
import { planByName } from "@/lib/plans";
import { formatUsd } from "@/lib/utils";
import { CheckoutButton, LaunchReconcile } from "@/components/client/BillingActions";

export const dynamic = "force-dynamic";

/**
 * Dedicated launch / setup-fee checkout page. The customer lands here after
 * approving their preview (real accounts). It summarizes the one-time setup fee
 * + first month, sends them to Stripe Checkout, and — on return from a
 * successful payment — confirms the site is going live (the billing webhook does
 * the actual launchPreview()).
 */
export default async function LaunchPage({ searchParams }: { searchParams: Promise<{ checkout?: string; session_id?: string }> }) {
  const ws = await getClientWorkspace();
  if (!ws) redirect("/login");
  const { checkout, session_id } = await searchParams;

  const paid = checkout === "success";
  const live = ws.preview.live;

  // Already live, or just paid: confirmation state. (On immediate return the webhook
  // may not have flipped the preview to LIVE yet — reassure either way.)
  if (live || paid) {
    return (
      <Shell>
        {/* Apply the launch directly from the session if the webhook hasn't (then refresh to "live"). */}
        {paid && !live && <LaunchReconcile sessionId={session_id} />}
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-green-100 text-green-700"><Rocket size={30} /></span>
        <h1 className="mt-5 font-display text-3xl text-stone-900">{live ? "Your site is live! 🎉" : "Payment received — you're launching! 🎉"}</h1>
        <p className="mt-2 max-w-md text-stone-600">
          {live
            ? "Your website is published and your plan features are on. Share it with the world."
            : "Thanks! We're publishing your site now — this usually takes a moment. It'll appear on your website page shortly."}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link href="/client/website" className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-700">
            Go to your website
          </Link>
          {live && ws.preview.url && (
            <a href={ws.preview.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 hover:underline">
              View live site <ExternalLink size={15} />
            </a>
          )}
        </div>
      </Shell>
    );
  }

  // Nothing to pay (not approved / setup fee not due) — send them back to the site page.
  if (!ws.preview.awaitingPayment) redirect("/client/website");

  const plan = planByName(ws.planName);
  const setup = plan?.setupFee ?? 0;
  const monthly = plan?.monthlyFee ?? 0;
  const dueToday = setup + monthly;
  const cancelled = checkout === "cancel";

  return (
    <Shell>
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-amber-700"><Rocket size={30} /></span>
      <h1 className="mt-5 font-display text-3xl text-stone-900">Launch {ws.client.businessName}</h1>
      <p className="mt-2 max-w-md text-stone-600">
        Your preview is approved. Complete checkout to publish your site, connect your domain, and turn on your{" "}
        <strong>{plan?.label ?? ws.planName}</strong> features.
      </p>

      {cancelled && (
        <p className="mt-4 w-full max-w-md rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Checkout was cancelled — no charge was made. You can complete it whenever you&apos;re ready.
        </p>
      )}

      <div className="mt-6 w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 text-left shadow-card">
        <div className="flex items-center justify-between text-sm">
          <span className="text-stone-600">One-time setup</span>
          <span className="font-semibold text-stone-900">{formatUsd(setup)}</span>
        </div>
        <div className="mt-2.5 flex items-center justify-between text-sm">
          <span className="text-stone-600">{plan?.label ?? ws.planName} — first month</span>
          <span className="font-semibold text-stone-900">{formatUsd(monthly)}</span>
        </div>
        <div className="mt-3 border-t border-stone-100 pt-3 flex items-center justify-between">
          <span className="font-semibold text-stone-900">Due today</span>
          <span className="font-display text-xl text-stone-900">{formatUsd(dueToday)}</span>
        </div>
        <p className="mt-2 text-xs text-stone-400">Then {formatUsd(monthly)}/month. Cancel anytime.</p>
      </div>

      <ul className="mt-5 w-full max-w-md space-y-2 text-left text-sm text-stone-700">
        {["Your site publishes immediately", "Your custom domain connects (if set up)", "Your plan features turn on"].map((t) => (
          <li key={t} className="flex items-start gap-2.5"><Check size={17} className="mt-0.5 shrink-0 text-amber-500" /> {t}</li>
        ))}
      </ul>

      <div className="mt-6 flex w-full max-w-md flex-col items-stretch gap-3">
        <CheckoutButton kind="setup" label={`Continue to secure checkout — ${formatUsd(dueToday)}`} />
        <Link href="/client/website" className="text-center text-sm font-semibold text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline">
          Not yet — back to my website
        </Link>
      </div>
      <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-stone-400"><ShieldCheck size={14} /> Secure payment by Stripe</p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-6 py-12 text-center">{children}</div>
  );
}
