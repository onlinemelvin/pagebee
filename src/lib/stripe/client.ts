import Stripe from "stripe";

/**
 * Platform Stripe client + Connect helpers. All money movement is via Stripe Connect: the platform
 * creates charges and takes an application fee, funds settle to the client's connected account.
 * Two connect modes:
 *   - "use ours"      → Custom connected accounts (white-label; PageBee collects all KYC and owns the
 *                       onboarding UX — see payments/onboarding.ts). PageBee is the platform of record
 *                       and carries dispute / negative-balance liability for these accounts.
 *   - "bring your own" → Standard accounts linked via OAuth (payments/service.ts startConnect).
 * Charges are DESTINATION charges (created on the platform, funds transferred to the connected
 * account), so saved cards / Customers for off-session billing live on the PLATFORM. PageBee never
 * custodies funds.
 *
 * NOTE (open decision): Custom carries materially more liability than Express. Confirm the account
 * type with Stripe's risk team before scaling; keep docs + code in sync with whatever is chosen.
 *
 * Everything is guarded on `STRIPE_SECRET_KEY` so the app runs fine before Stripe is configured.
 */

export class StripeNotConfiguredError extends Error {
  constructor() {
    super("stripe_not_configured");
  }
}

let _stripe: Stripe | null = null;

/** True once the platform secret key is present (test or live). */
export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** The platform Stripe client. Throws StripeNotConfiguredError if keys aren't set. */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeNotConfiguredError();
  if (!_stripe) _stripe = new Stripe(key); // use the SDK's pinned API version
  return _stripe;
}

/** OAuth client id for the "bring your own Stripe" (Connect Standard) flow. */
export function connectClientId(): string | null {
  return process.env.STRIPE_CONNECT_CLIENT_ID ?? null;
}

export function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/** Platform application fee in basis points (default 2.00%). Applied to every charge. */
export const PLATFORM_FEE_BPS = Number(process.env.STRIPE_PLATFORM_FEE_BPS ?? 200);

/** Application fee (cents) for a charge of `amount` cents. */
export function applicationFee(amount: number): number {
  return Math.max(0, Math.round((amount * PLATFORM_FEE_BPS) / 10_000));
}
