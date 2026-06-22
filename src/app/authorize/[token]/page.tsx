import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { getPlanAuthContext } from "@/lib/modules/payments";
import { CardAuthorizationForm } from "@/components/payments/CardAuthorizationForm";

export const dynamic = "force-dynamic";

/**
 * Public, white-label card-on-file authorization. A business shares this link
 * (/authorize/{token}) so a customer can save a card for automatic recurring
 * payments on a PageBee-branded page — they never hand their card to the business.
 */
export default async function AuthorizePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await getPlanAuthContext(token);
  if (!ctx) notFound();

  return (
    <div className="min-h-dvh bg-stone-100 py-10">
      <div className="mx-auto max-w-md px-4">
        <article className="rounded-2xl border border-stone-200 bg-white p-8 shadow-card">
          <p className="font-display text-2xl text-stone-900">{ctx.businessName}</p>
          <p className="mt-1 text-sm text-stone-500">Set up automatic payments</p>

          <div className="mt-6">
            {ctx.authorized ? (
              <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-green-100 text-green-700"><Check size={24} /></span>
                <h2 className="mt-3 font-display text-xl text-stone-900">Already authorized</h2>
                <p className="mt-1 text-sm text-stone-600">A card is already on file for these payments. Contact {ctx.businessName} to make changes.</p>
              </div>
            ) : !ctx.paymentsAvailable ? (
              <p className="text-sm text-stone-500">This business isn&apos;t set up to take card payments yet. Please check back later.</p>
            ) : (
              <CardAuthorizationForm
                token={token}
                businessName={ctx.businessName}
                amountPerCycle={ctx.amountPerCycle}
                currency={ctx.currency}
                interval={ctx.interval}
              />
            )}
          </div>
        </article>
        <p className="mt-3 text-center text-xs text-stone-400">Powered by PageBee</p>
      </div>
    </div>
  );
}
