import { prisma } from "@/lib/db";
import type { EmailCategory } from "@prisma/client";
import { sendEmail, type EmailAttachment } from "./send";
import { renderTenantLayout } from "./tenant-layout";
import { resolveClientBrand, resolveClientSender, type ClientBrand } from "./tenant-sender";
import { customerEmailConsent, customerUnsubPageUrl, customerUnsubOneClickUrl } from "./customer-consent";

/** Categories that carry an unsubscribe footer + honour customer opt-out. */
const MARKETING: EmailCategory = "CUSTOMER_MARKETING";
const REVIEW: EmailCategory = "CUSTOMER_REVIEW";

export interface CustomerDispatchParams {
  clientId: string;
  to: string;
  subject: string;
  body: string; // inner HTML (tenant layout wraps it)
  category: EmailCategory; // a CUSTOMER_* category
  template: string;
  preheader?: string;
  customerId?: string | null; // required for marketing (consent) + unsubscribe
  attachments?: EmailAttachment[];
  /** Pre-resolved brand, to avoid re-querying in batch sends. */
  brand?: ClientBrand;
}

export interface CustomerDispatchResult {
  logId: string | null;
  providerId: string | null;
  status: "SENT" | "FAILED" | "SUPPRESSED" | "STUBBED" | "SKIPPED";
}

/**
 * The single funnel for CLIENT → CUSTOMER email. Resolves the client's branding
 * + sending identity, enforces consent (marketing opt-in / review opt-out),
 * wraps the body in the client-branded layout, logs to EmailLog (audience =
 * CUSTOMER), and sends from the client's domain (or the shared fallback).
 */
export async function dispatchToCustomer(params: CustomerDispatchParams): Promise<CustomerDispatchResult> {
  const to = params.to.trim();
  if (!to) return { logId: null, providerId: null, status: "SKIPPED" };

  const brand = params.brand ?? (await resolveClientBrand(params.clientId));
  if (!brand) {
    console.warn(`[email:customer] no brand for client ${params.clientId}`);
    return { logId: null, providerId: null, status: "SKIPPED" };
  }

  const isMarketing = params.category === MARKETING;
  const isReview = params.category === REVIEW;

  // Consent: marketing needs explicit opt-in; review respects an explicit opt-out.
  if (params.customerId && (isMarketing || isReview)) {
    const consent = await customerEmailConsent(params.customerId);
    if (isMarketing && consent !== "granted") return await logSuppressed(params, brand, "no_marketing_consent");
    if (isReview && consent === "revoked") return await logSuppressed(params, brand, "opted_out");
  } else if (isMarketing && !params.customerId) {
    // Can't verify consent without a customer record — never blast marketing blind.
    return { logId: null, providerId: null, status: "SKIPPED" };
  }

  const sender = await resolveClientSender(brand);
  const showUnsub = Boolean(params.customerId) && (isMarketing || isReview);
  const unsubscribeUrl = showUnsub ? customerUnsubPageUrl(params.customerId!) : undefined;
  const oneClickUrl = showUnsub ? customerUnsubOneClickUrl(params.customerId!) : undefined;
  const html = renderTenantLayout({ brand, body: params.body, preheader: params.preheader, unsubscribeUrl });

  const log = await prisma.emailLog.create({
    data: {
      clientId: params.clientId,
      customerId: params.customerId ?? null,
      audience: "CUSTOMER",
      toEmail: to,
      fromEmail: sender.from,
      subject: params.subject,
      template: params.template,
      category: params.category,
      status: "QUEUED",
    },
    select: { id: true },
  });

  try {
    const res = await sendEmail({
      to,
      subject: params.subject,
      html,
      from: sender.from,
      replyTo: sender.replyTo ?? undefined,
      attachments: params.attachments,
      listUnsubscribeUrl: oneClickUrl,
      headers: { "X-Entity-Ref-ID": log.id },
    });
    await prisma.emailLog.update({
      where: { id: log.id },
      data: { status: res.stubbed ? "QUEUED" : "SENT", providerId: res.id, sentAt: new Date() },
    });
    return { logId: log.id, providerId: res.id, status: res.stubbed ? "STUBBED" : "SENT" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.emailLog.update({ where: { id: log.id }, data: { status: "FAILED", error: message } });
    return { logId: log.id, providerId: null, status: "FAILED" };
  }
}

async function logSuppressed(params: CustomerDispatchParams, brand: ClientBrand, reason: string): Promise<CustomerDispatchResult> {
  const sender = await resolveClientSender(brand);
  const log = await prisma.emailLog.create({
    data: {
      clientId: params.clientId,
      customerId: params.customerId ?? null,
      audience: "CUSTOMER",
      toEmail: params.to.trim(),
      fromEmail: sender.from,
      subject: params.subject,
      template: params.template,
      category: params.category,
      status: "FAILED",
      error: `suppressed:${reason}`,
    },
    select: { id: true },
  });
  return { logId: log.id, providerId: null, status: "SUPPRESSED" };
}
