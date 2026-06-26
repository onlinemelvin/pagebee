import { prisma } from "@/lib/db";
import type { EmailCategory } from "@prisma/client";
import { sendEmail, type EmailAttachment } from "./send";
import { renderLayout } from "./layout";
import { isMarketing } from "./categories";
import { isSuppressed, unsubscribeUrlFor } from "./preferences";

const DEFAULT_FROM = process.env.RESEND_FROM_EMAIL ?? "PageBee <noreply@pagebee.com>";
// Optional global reply-to (e.g. a real inbox while the sending domain is a
// placeholder). Per-send `replyTo` still overrides it.
const DEFAULT_REPLY_TO = process.env.RESEND_REPLY_TO || undefined;

export interface DispatchParams {
  to: string;
  subject: string;
  /** Inner body HTML — wrapped in the branded layout unless `rawHtml` is true. */
  body: string;
  category: EmailCategory;
  /** Template/trigger key recorded on the EmailLog row (e.g. "welcome"). */
  template?: string;
  preheader?: string;
  clientId?: string | null;
  recipientUserId?: string | null;
  recipientLabel?: string;
  campaignId?: string | null;
  replyTo?: string;
  attachments?: EmailAttachment[];
  /** When true, `body` is already a full HTML document (skip the layout). */
  rawHtml?: boolean;
  /**
   * RFC 8058 one-click List-Unsubscribe endpoint for this send. Marketing mail
   * sets this automatically; transactional senders (e.g. team invites) may pass
   * a purpose-specific opt-out URL — a working header improves inbox placement.
   */
  listUnsubscribeUrl?: string;
}

export interface DispatchResult {
  logId: string;
  providerId: string | null;
  status: "SENT" | "FAILED" | "SUPPRESSED" | "STUBBED";
}

/**
 * The single funnel every platform→client email goes through. It:
 *  1. honours the marketing suppression list (transactional mail always sends),
 *  2. wraps the body in the branded layout (+ unsubscribe footer for marketing),
 *  3. writes an EmailLog row and updates it with the provider id / status,
 * so the admin dashboard and the Resend webhook can reconcile every send.
 */
export async function dispatch(params: DispatchParams): Promise<DispatchResult> {
  const to = params.to.trim();
  const marketing = isMarketing(params.category);

  // 1. Suppression — marketing only.
  if (marketing && (await isSuppressed(to, params.category))) {
    const log = await prisma.emailLog.create({
      data: {
        clientId: params.clientId ?? null,
        recipientUserId: params.recipientUserId ?? null,
        toEmail: to,
        fromEmail: DEFAULT_FROM,
        subject: params.subject,
        template: params.template,
        category: params.category,
        campaignId: params.campaignId ?? null,
        status: "FAILED",
        error: "suppressed:unsubscribed",
      },
      select: { id: true },
    });
    return { logId: log.id, providerId: null, status: "SUPPRESSED" };
  }

  // 2. Build the unsubscribe links + branded HTML.
  let pageUrl: string | undefined;
  let oneClickUrl: string | undefined;
  if (marketing) {
    const urls = await unsubscribeUrlFor(to, params.clientId);
    pageUrl = urls.pageUrl;
    oneClickUrl = urls.oneClickUrl;
  }

  const html = params.rawHtml
    ? params.body
    : renderLayout({
        body: params.body,
        preheader: params.preheader,
        unsubscribeUrl: pageUrl,
        recipientLabel: params.recipientLabel,
      });

  // 3. Log QUEUED, send, then reconcile.
  const log = await prisma.emailLog.create({
    data: {
      clientId: params.clientId ?? null,
      recipientUserId: params.recipientUserId ?? null,
      toEmail: to,
      fromEmail: DEFAULT_FROM,
      subject: params.subject,
      template: params.template,
      category: params.category,
      campaignId: params.campaignId ?? null,
      status: "QUEUED",
    },
    select: { id: true },
  });

  try {
    const res = await sendEmail({
      to,
      subject: params.subject,
      html,
      replyTo: params.replyTo ?? DEFAULT_REPLY_TO,
      attachments: params.attachments,
      listUnsubscribeUrl: oneClickUrl ?? params.listUnsubscribeUrl,
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
