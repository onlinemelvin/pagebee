import { prisma } from "@/lib/db";
import { dispatch } from "./dispatch";
import { appBase } from "./layout";
import * as t from "./templates";
import { createNotificationFromEmail, isEmailAllowed } from "@/lib/modules/notification";

// — URL builders --------------------------------------------------------------
const base = () => appBase();
export const dashboardUrl = () => `${base()}/client`;
export const billingUrl = () => `${base()}/client/billing`;
export const websiteUrl = () => `${base()}/client/website`;
export const supportUrl = () => `${base()}/client?support=1`;
export const upgradeUrl = () => `${base()}/client/billing?upgrade=1`;
export const reviewUrl = () => `${base()}/client/website`;

interface Recipient {
  to: string;
  clientId: string;
  recipientUserId: string | null;
  businessName: string;
  ownerName: string | null;
}

/**
 * Resolve a client's primary email recipient (the owner). Returns null when the
 * client or a usable email can't be found, so callers can fail-soft.
 */
export async function clientRecipient(clientId: string): Promise<Recipient | null> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      businessName: true,
      ownerName: true,
      ownerEmail: true,
      users: { where: { role: "owner" }, select: { userId: true, user: { select: { email: true } } }, take: 1 },
    },
  });
  if (!client) return null;
  const owner = client.users[0];
  const to = client.ownerEmail ?? owner?.user.email;
  if (!to) return null;
  return { to, clientId, recipientUserId: owner?.userId ?? null, businessName: client.businessName, ownerName: client.ownerName };
}

/**
 * Send a built template to a client's owner. Fail-soft (logs, never throws).
 *
 * This is the single funnel for every owner-facing notification, so it owns BOTH
 * channels: it always records an in-app (dashboard) notification, then sends the
 * email copy only when the owner has opted in for that notification's group
 * (critical mail — security, account, payment failures — always sends). Any new
 * owner notification added via toClient() therefore gets both channels for free.
 */
async function toClient(clientId: string, build: (r: Recipient) => t.BuiltEmail): Promise<void> {
  try {
    const r = await clientRecipient(clientId);
    if (!r) {
      console.warn(`[email:notify] no recipient for client ${clientId}`);
      return;
    }
    const e = build(r);

    // 1. In-app notification — always (the bell isn't gated by email prefs).
    await createNotificationFromEmail(r.clientId, r.recipientUserId, e);

    // 2. Email copy — gated by the owner's per-group opt-in.
    if (!(await isEmailAllowed(r.clientId, e.category, e.template))) return;

    await dispatch({
      to: r.to,
      subject: e.subject,
      body: e.body,
      preheader: e.preheader,
      category: e.category,
      template: e.template,
      clientId: r.clientId,
      recipientUserId: r.recipientUserId,
      recipientLabel: r.businessName,
    });
  } catch (err) {
    console.error(`[email:notify] failed for client ${clientId}`, err);
  }
}

// — Onboarding ----------------------------------------------------------------
export const sendWelcome = (clientId: string) =>
  toClient(clientId, (r) => t.welcomeEmail({ businessName: r.businessName, ownerName: r.ownerName, dashboardUrl: dashboardUrl() }));

// — Billing -------------------------------------------------------------------
export const sendPaymentReceipt = (clientId: string, args: { amountCents: number; description: string; when: string; invoiceUrl?: string }) =>
  toClient(clientId, (r) => t.paymentReceiptEmail({ businessName: r.businessName, ownerName: r.ownerName, ...args }));

export const sendPaymentFailed = (clientId: string, args: { amountCents: number; attempt: number }) =>
  toClient(clientId, (r) => t.paymentFailedEmail({ businessName: r.businessName, ownerName: r.ownerName, updatePaymentUrl: billingUrl(), ...args }));

export const sendRenewalNotice = (clientId: string, args: { amountCents: number; renewsOn: string }) =>
  toClient(clientId, (r) => t.renewalNoticeEmail({ businessName: r.businessName, ownerName: r.ownerName, manageUrl: billingUrl(), ...args }));

export const sendSubscriptionCancelled = (clientId: string, args: { accessUntil?: string } = {}) =>
  toClient(clientId, (r) => t.subscriptionCancelledEmail({ businessName: r.businessName, ownerName: r.ownerName, reactivateUrl: billingUrl(), ...args }));

export const sendPlanChanged = (clientId: string, args: { fromPlan: string; toPlan: string }) =>
  toClient(clientId, (r) => t.planChangedEmail({ businessName: r.businessName, ownerName: r.ownerName, dashboardUrl: billingUrl(), ...args }));

// — Website lifecycle ---------------------------------------------------------
export const sendPreviewReady = (clientId: string) =>
  toClient(clientId, (r) => t.previewReadyEmail({ businessName: r.businessName, ownerName: r.ownerName, reviewUrl: reviewUrl() }));

export const sendSitePublished = (clientId: string, siteUrl: string) =>
  toClient(clientId, (r) => t.sitePublishedEmail({ businessName: r.businessName, ownerName: r.ownerName, siteUrl }));

export const sendUpdateApproved = (clientId: string, siteUrl: string) =>
  toClient(clientId, (r) => t.updateApprovedEmail({ businessName: r.businessName, ownerName: r.ownerName, siteUrl }));

export const sendUpdateRejected = (clientId: string, reason?: string) =>
  toClient(clientId, (r) => t.updateRejectedEmail({ businessName: r.businessName, ownerName: r.ownerName, reason, dashboardUrl: dashboardUrl() }));

// — Usage / reminders ---------------------------------------------------------
export const sendQuotaWarning = (clientId: string, args: { metric: string; used: number; limit: number }) =>
  toClient(clientId, (r) => t.quotaWarningEmail({ businessName: r.businessName, ownerName: r.ownerName, upgradeUrl: upgradeUrl(), ...args }));

export const sendSetupFeePending = (clientId: string) =>
  toClient(clientId, (r) => t.setupFeePendingEmail({ businessName: r.businessName, ownerName: r.ownerName, payUrl: billingUrl() }));

export const sendPreviewAutoReleaseReminder = (clientId: string, hoursLeft: number) =>
  toClient(clientId, (r) => t.previewAutoReleaseReminderEmail({ businessName: r.businessName, ownerName: r.ownerName, reviewUrl: reviewUrl(), hoursLeft }));

// — Account security (addressed to a specific user/email) ---------------------
async function toEmail(args: {
  to: string;
  clientId?: string | null;
  recipientUserId?: string | null;
  recipientLabel?: string;
  build: t.BuiltEmail;
}): Promise<void> {
  try {
    await dispatch({
      to: args.to,
      subject: args.build.subject,
      body: args.build.body,
      preheader: args.build.preheader,
      category: args.build.category,
      template: args.build.template,
      clientId: args.clientId ?? null,
      recipientUserId: args.recipientUserId ?? null,
      recipientLabel: args.recipientLabel,
    });
  } catch (err) {
    console.error(`[email:notify] failed for ${args.to}`, err);
  }
}

export const sendPasswordReset = (to: string, args: { name?: string | null; resetUrl: string; expiresMinutes: number; userId?: string }) =>
  toEmail({ to, recipientUserId: args.userId ?? null, build: t.passwordResetEmail(args) });

export const sendEmailVerify = (to: string, args: { name?: string | null; verifyUrl: string; userId?: string }) =>
  toEmail({ to, recipientUserId: args.userId ?? null, build: t.emailVerifyEmail(args) });

export const sendPasswordChanged = (to: string, args: { name?: string | null; userId?: string }) =>
  toEmail({ to, recipientUserId: args.userId ?? null, build: t.passwordChangedEmail({ ...args, supportUrl: supportUrl() }) });

export const sendEmailChanged = (to: string, args: { name?: string | null; newEmail: string; userId?: string }) =>
  toEmail({ to, recipientUserId: args.userId ?? null, build: t.emailChangedEmail({ ...args, supportUrl: supportUrl() }) });

export const sendNewDeviceLogin = (to: string, args: { name?: string | null; when: string; context: string; userId?: string }) =>
  toEmail({ to, recipientUserId: args.userId ?? null, build: t.newDeviceLoginEmail({ ...args, supportUrl: supportUrl() }) });
