import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import type { DeliveryStatus, Prisma } from "@prisma/client";
import { suppressFromProvider } from "./preferences";

// Resend delivers webhooks through Svix. We verify the signature manually
// (HMAC-SHA256 over `${id}.${timestamp}.${body}` with the decoded whsec secret)
// to avoid pulling in the svix runtime dependency.

export interface ResendWebhookHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

/** Verify a Svix-signed Resend webhook. Returns true when valid (or when no
 *  secret is configured — dev/stub mode). */
export function verifyResendSignature(headers: ResendWebhookHeaders, rawBody: string): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  // Fail CLOSED in production: an unset secret would otherwise accept forged
  // webhooks that can poison the suppression list / falsify delivery analytics.
  // Only dev/test accepts an unconfigured secret.
  if (!secret) return process.env.NODE_ENV !== "production";
  if (!headers.id || !headers.timestamp || !headers.signature) return false;

  // Reject stale deliveries (> 5 min skew) to blunt replay.
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", key).update(signedContent).digest("base64");
  // Header is space-separated "v1,<sig> v1,<sig>"; match any.
  return headers.signature.split(" ").some((part) => {
    const sig = part.includes(",") ? part.split(",")[1] : part;
    try {
      return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false;
    }
  });
}

interface ResendEvent {
  type: string;
  created_at?: string;
  data?: { email_id?: string; to?: string | string[] };
}

const STATUS_RANK: Record<DeliveryStatus, number> = {
  QUEUED: 0,
  SENT: 1,
  DELIVERED: 2,
  OPENED: 3,
  BOUNCED: 4,
  FAILED: 4,
};

/**
 * Apply one Resend webhook event to the matching EmailLog row (by providerId =
 * Resend email id) and roll up campaign counters. Idempotent: timestamps are
 * only set once, so redeliveries don't double-count.
 */
export async function handleResendEvent(event: ResendEvent): Promise<void> {
  const emailId = event.data?.email_id;
  if (!emailId) return;
  const at = event.created_at ? new Date(event.created_at) : new Date();

  const log = await prisma.emailLog.findFirst({
    where: { providerId: emailId },
    select: { id: true, status: true, campaignId: true, toEmail: true, deliveredAt: true, openedAt: true, bouncedAt: true, complainedAt: true },
  });
  if (!log) return;

  const data: Prisma.EmailLogUpdateInput = {};
  let counter: "deliveredCount" | "openedCount" | "bouncedCount" | "failedCount" | null = null;
  let nextStatus: DeliveryStatus | null = null;

  switch (event.type) {
    case "email.sent":
      nextStatus = "SENT";
      if (!log.deliveredAt) data.sentAt = at;
      break;
    case "email.delivered":
      nextStatus = "DELIVERED";
      if (!log.deliveredAt) {
        data.deliveredAt = at;
        counter = "deliveredCount";
      }
      break;
    case "email.opened":
      nextStatus = "OPENED";
      data.openCount = { increment: 1 };
      if (!log.openedAt) {
        data.openedAt = at;
        counter = "openedCount";
      }
      break;
    case "email.clicked":
      data.clickCount = { increment: 1 };
      data.clickedAt = at;
      break;
    case "email.bounced":
      nextStatus = "BOUNCED";
      if (!log.bouncedAt) {
        data.bouncedAt = at;
        counter = "bouncedCount";
      }
      await suppressFromProvider(log.toEmail, "bounce");
      break;
    case "email.complained":
      if (!log.complainedAt) data.complainedAt = at;
      await suppressFromProvider(log.toEmail, "complaint");
      break;
    default:
      return; // delivery_delayed etc. — ignore
  }

  // Never downgrade status (e.g. a late "delivered" after "opened").
  if (nextStatus && STATUS_RANK[nextStatus] >= STATUS_RANK[log.status]) data.status = nextStatus;

  await prisma.emailLog.update({ where: { id: log.id }, data });

  if (counter && log.campaignId) {
    await prisma.emailCampaign.update({ where: { id: log.campaignId }, data: { [counter]: { increment: 1 } } });
  }
}
