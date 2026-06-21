import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { appBase } from "./layout";

// Per-customer email consent for the CLIENT → CUSTOMER stream. Marketing requires
// an explicit opt-in (CustomerConsent EMAIL granted = true); review requests send
// unless the customer has explicitly opted out. Transactional mail ignores this.
// Unsubscribe links are STATELESS — a signed token over the customerId — so no
// extra storage or per-send token rows are needed.

function secret(): string {
  return process.env.EMAIL_TOKEN_SECRET || process.env.INTERNAL_API_SECRET || process.env.RESEND_API_KEY || "pagebee-dev-secret";
}

function sign(customerId: string): string {
  return crypto.createHmac("sha256", secret()).update(`unsub:${customerId}`).digest("base64url").slice(0, 32);
}

/** A stateless, signed unsubscribe token for a customer. */
export function customerUnsubToken(customerId: string): string {
  return `${customerId}.${sign(customerId)}`;
}

/** Verify a customer unsubscribe token; returns the customerId or null. */
export function verifyCustomerUnsubToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const customerId = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(customerId);
  try {
    return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? customerId : null;
  } catch {
    return null;
  }
}

/** Human-facing confirmation page (the footer "Unsubscribe" link). */
export function customerUnsubPageUrl(customerId: string): string {
  return `${appBase()}/unsubscribe/customer/${customerUnsubToken(customerId)}`;
}

/** RFC 8058 one-click POST endpoint (the List-Unsubscribe header). */
export function customerUnsubOneClickUrl(customerId: string): string {
  return `${appBase()}/api/v1/public/customer-unsubscribe?token=${customerUnsubToken(customerId)}`;
}

export type CustomerConsentState = "granted" | "revoked" | "unknown";

/** Current EMAIL consent state for a customer. */
export async function customerEmailConsent(customerId: string): Promise<CustomerConsentState> {
  const row = await prisma.customerConsent.findUnique({
    where: { customerId_channel: { customerId, channel: "EMAIL" } },
    select: { granted: true },
  });
  if (!row) return "unknown";
  return row.granted ? "granted" : "revoked";
}

/** Set a customer's EMAIL consent (opt-in/opt-out). Idempotent upsert. */
export async function setCustomerEmailConsent(customerId: string, granted: boolean, source = "manual"): Promise<void> {
  const now = new Date();
  await prisma.customerConsent.upsert({
    where: { customerId_channel: { customerId, channel: "EMAIL" } },
    create: { customerId, channel: "EMAIL", granted, source, grantedAt: granted ? now : null, revokedAt: granted ? null : now },
    update: { granted, ...(granted ? { grantedAt: now, revokedAt: null } : { revokedAt: now }) },
  });
}

/** Resolve an unsubscribe token and opt the customer out of marketing email. */
export async function unsubscribeCustomerByToken(token: string): Promise<{ businessName: string } | null> {
  const customerId = verifyCustomerUnsubToken(token);
  if (!customerId) return null;
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, client: { select: { businessName: true } } },
  });
  if (!customer) return null;
  await setCustomerEmailConsent(customerId, false, "unsubscribe_link");
  return { businessName: customer.client.businessName };
}
