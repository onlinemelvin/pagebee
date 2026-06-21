import { AuthError } from "./errors";

/**
 * Authorization policy — the single backend source of truth for whether a tenant may do something,
 * independent of what the frontend allows. The UI hides things for UX; these assertions ENFORCE them.
 *
 * Three axes, each centralized here so the rule lives in one place rather than per-route:
 *   - account status  → assertActiveAccount  (wired into requireClient/requireOwner)
 *   - plan/tier        → assertFeature        (mirrors the per-service assert* helpers)
 *   - launch/payment   → setupFeeRequired     (fail-closed in production)
 */

/** Minimal shape the policy needs — structurally matches the client loaded by getCurrentClient. */
export interface PolicyClient {
  status: string; // "active" | "suspended" | "churned"
  isTest?: boolean;
  subscription:
    | {
        status: string; // SubscriptionStatus
        setupFeePaid?: boolean;
        plan: { featureFlags: unknown };
      }
    | null;
}

// Subscription/client statuses that fully block app actions (read + write) — billing only.
const BLOCKED_SUB = new Set(["SUSPENDED", "CANCELLED"]);
const BLOCKED_CLIENT = new Set(["suspended", "churned"]);
// Statuses that still work but should surface a warning (grace period for a failed/late payment).
const WARN_SUB = new Set(["PAST_DUE", "PAYMENT_FAILED"]);

export interface AccountAccess {
  /** May the tenant use the app right now? false → blocked (suspended/cancelled), billing only. */
  ok: boolean;
  /** Working, but in a payment grace period — show a warning banner. */
  warn: boolean;
  /** Machine-readable reason when blocked/warned (else null). */
  reason: "subscription_inactive" | "payment_past_due" | null;
}

/**
 * Grace policy (chosen 2026-06-15): ACTIVE/TRIAL/SETUP_PENDING → full; PAST_DUE/PAYMENT_FAILED →
 * allowed with a warning (a failed card shouldn't instantly lock out a paying customer);
 * SUSPENDED/CANCELLED (or client suspended/churned) → blocked, billing/upgrade only.
 */
export function accountAccess(client: PolicyClient): AccountAccess {
  const subStatus = client.subscription?.status;
  if (BLOCKED_CLIENT.has(client.status) || (subStatus !== undefined && BLOCKED_SUB.has(subStatus))) {
    return { ok: false, warn: false, reason: "subscription_inactive" };
  }
  const warn = subStatus !== undefined && WARN_SUB.has(subStatus);
  return { ok: true, warn, reason: warn ? "payment_past_due" : null };
}

/**
 * Throw (402) when the tenant's account status forbids app actions. Wired into requireClient /
 * requireOwner so it's enforced on every API mutation by default; reactivation routes
 * (billing checkout, plan upgrade) opt out via `{ allowInactive: true }`.
 */
export function assertActiveAccount(client: PolicyClient): void {
  if (!accountAccess(client).ok) throw new AuthError(402, "subscription_inactive");
}

/**
 * Throw (403) unless the tenant's PLAN includes `flag`. Server-side feature gate — the same check
 * the public site paths use, applied to authenticated owner paths too so the API can't be hit
 * directly to use a capability the plan doesn't include.
 */
export function assertFeature(client: PolicyClient, flag: string): void {
  const flags = (client.subscription?.plan.featureFlags ?? {}) as Record<string, unknown>;
  if (flags[flag] !== true) throw new AuthError(403, "feature_not_in_plan");
}

/**
 * Whether approving a preview must collect the one-time setup fee before launching (vs launching
 * immediately). Test accounts never pay. Real accounts: gated by SETUP_FEE_ENABLED, but
 * FAIL-CLOSED — in production a missing/blank flag still requires payment; only an explicit
 * SETUP_FEE_ENABLED="false" (or dev default) skips it. So a forgotten env var can't give the site
 * away for free.
 */
export function setupFeeRequired(client: { isTest?: boolean }): boolean {
  if (client.isTest) return false;
  const flag = process.env.SETUP_FEE_ENABLED;
  if (flag === "true") return true;
  if (flag === "false") return false;
  // Unset/blank: required in production (fail-closed), skipped in dev for local testing.
  return process.env.NODE_ENV === "production";
}

/**
 * Eligibility for the test-only domain "dry-run" toggle (simulate a purchase: no registrar call, no
 * charge). PageBee testers only — emails on @test.com or the owner's account. This is the SINGLE
 * source of truth: the website page only renders the toggle when this is true, the toggle API
 * re-checks it (403 otherwise), and executePurchase only honours a dry-run flag a gated user set.
 * So the capability never bleeds to a real customer's frontend.
 */
export function isDomainDryRunEligible(email: string | null | undefined): boolean {
  return isTestModeEligible(email);
}

/**
 * Who may toggle global Test Mode (stubs LLM generation by replaying saved data,
 * and simulates domain purchases). Restricted to test accounts + the platform
 * owner's inbox so a real customer can never enable it from the frontend.
 */
export function isTestModeEligible(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return e.endsWith("@test.com") || e === "onlinemelvin@gmail.com";
}
