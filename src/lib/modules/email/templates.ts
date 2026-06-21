import { formatMoney } from "@/lib/modules/finance/money";
import type { EmailCategory } from "@prisma/client";
import { escapeHtml } from "./send";
import { button, linkFallback } from "./layout";

export interface BuiltEmail {
  subject: string;
  preheader: string;
  body: string; // inner HTML for renderLayout
  category: EmailCategory;
  template: string; // trigger key recorded on EmailLog
}

const p = (html: string) => `<p style="margin:0 0 14px">${html}</p>`;
const h = (text: string) => `<h1 style="margin:0 0 16px;font-size:22px;font-weight:800;letter-spacing:-0.01em">${escapeHtml(text)}</h1>`;
const greet = (name?: string | null) => p(`Hi${name ? ` ${escapeHtml(name.split(" ")[0])}` : ""},`);

// — Onboarding ----------------------------------------------------------------

export function welcomeEmail(args: { businessName: string; ownerName?: string | null; dashboardUrl: string }): BuiltEmail {
  return {
    category: "WELCOME",
    template: "welcome",
    subject: `Welcome to PageBee, ${args.businessName}`,
    preheader: "Your account is ready — here's how to get started.",
    body:
      h(`Welcome to PageBee 🐝`) +
      greet(args.ownerName) +
      p(`Your account for <strong>${escapeHtml(args.businessName)}</strong> is set up. From your dashboard you can review your website preview, manage leads and bookings, and update your business details any time.`) +
      button("Open your dashboard", args.dashboardUrl) +
      p(`We'll email you the moment your website preview is ready to review.`),
  };
}

// — Auth / security -----------------------------------------------------------

export function passwordResetEmail(args: { name?: string | null; resetUrl: string; expiresMinutes: number }): BuiltEmail {
  return {
    category: "AUTH",
    template: "password_reset",
    subject: "Reset your PageBee password",
    preheader: "Use the secure link to choose a new password.",
    body:
      h("Reset your password") +
      greet(args.name) +
      p(`We received a request to reset your PageBee password. Click below to choose a new one. This link expires in ${args.expiresMinutes} minutes.`) +
      button("Choose a new password", args.resetUrl) +
      linkFallback(args.resetUrl) +
      p(`<span style="color:#78716c;font-size:13px">If you didn't request this, you can safely ignore this email — your password won't change.</span>`),
  };
}

export function emailVerifyEmail(args: { name?: string | null; verifyUrl: string }): BuiltEmail {
  return {
    category: "AUTH",
    template: "email_verify",
    subject: "Verify your email for PageBee",
    preheader: "Confirm your email address to secure your account.",
    body:
      h("Verify your email") +
      greet(args.name) +
      p(`Please confirm this is your email address so we can keep your PageBee account secure.`) +
      button("Verify email", args.verifyUrl) +
      linkFallback(args.verifyUrl),
  };
}

export function passwordChangedEmail(args: { name?: string | null; supportUrl: string }): BuiltEmail {
  return {
    category: "ACCOUNT",
    template: "password_changed",
    subject: "Your PageBee password was changed",
    preheader: "Confirming a recent change to your account.",
    body:
      h("Your password was changed") +
      greet(args.name) +
      p(`Your PageBee password was just changed. If this was you, no action is needed.`) +
      p(`If you didn't do this, <a href="${args.supportUrl}" style="color:#f59e0b">contact us</a> right away.`),
  };
}

export function emailChangedEmail(args: { name?: string | null; newEmail: string; supportUrl: string }): BuiltEmail {
  return {
    category: "ACCOUNT",
    template: "email_changed",
    subject: "Your PageBee sign-in email was changed",
    preheader: "Confirming a recent change to your account.",
    body:
      h("Your sign-in email was changed") +
      greet(args.name) +
      p(`The email address used to sign in to PageBee was changed to <strong>${escapeHtml(args.newEmail)}</strong>.`) +
      p(`If you didn't request this, <a href="${args.supportUrl}" style="color:#f59e0b">contact us</a> immediately.`),
  };
}

export function newDeviceLoginEmail(args: { name?: string | null; when: string; context: string; supportUrl: string }): BuiltEmail {
  return {
    category: "AUTH",
    template: "new_device_login",
    subject: "New sign-in to your PageBee account",
    preheader: "We noticed a sign-in from a new device.",
    body:
      h("New sign-in detected") +
      greet(args.name) +
      p(`We noticed a new sign-in to your PageBee account:`) +
      p(`<strong>When:</strong> ${escapeHtml(args.when)}<br/><strong>Where:</strong> ${escapeHtml(args.context)}`) +
      p(`If this was you, you can ignore this. Otherwise, <a href="${args.supportUrl}" style="color:#f59e0b">secure your account</a>.`),
  };
}

// — Billing -------------------------------------------------------------------

export function paymentReceiptEmail(args: { businessName: string; amountCents: number; description: string; when: string; invoiceUrl?: string }): BuiltEmail {
  return {
    category: "BILLING",
    template: "payment_receipt",
    subject: `Receipt from PageBee — ${formatMoney(args.amountCents)}`,
    preheader: `Payment of ${formatMoney(args.amountCents)} received. Thank you.`,
    body:
      h("Payment received") +
      p(`Thanks! We've received your payment for <strong>${escapeHtml(args.businessName)}</strong>.`) +
      p(`<strong>Amount:</strong> ${formatMoney(args.amountCents)}<br/><strong>For:</strong> ${escapeHtml(args.description)}<br/><strong>Date:</strong> ${escapeHtml(args.when)}`) +
      (args.invoiceUrl ? button("View receipt", args.invoiceUrl) : ""),
  };
}

export function paymentFailedEmail(args: { businessName: string; amountCents: number; attempt: number; updatePaymentUrl: string }): BuiltEmail {
  return {
    category: "BILLING",
    template: "payment_failed",
    subject: "Action needed: your PageBee payment didn't go through",
    preheader: "Please update your payment method to keep your services active.",
    body:
      h("Your payment didn't go through") +
      p(`We couldn't process the ${formatMoney(args.amountCents)} payment for <strong>${escapeHtml(args.businessName)}</strong> (attempt ${args.attempt}).`) +
      p(`To avoid any interruption to your website and services, please update your payment method.`) +
      button("Update payment method", args.updatePaymentUrl) +
      p(`<span style="color:#78716c;font-size:13px">We'll automatically retry over the next few days.</span>`),
  };
}

export function renewalNoticeEmail(args: { businessName: string; amountCents: number; renewsOn: string; manageUrl: string }): BuiltEmail {
  return {
    category: "BILLING",
    template: "renewal_notice",
    subject: `Your PageBee plan renews on ${args.renewsOn}`,
    preheader: `${formatMoney(args.amountCents)} will be charged on ${args.renewsOn}.`,
    body:
      h("Upcoming renewal") +
      p(`Your PageBee plan for <strong>${escapeHtml(args.businessName)}</strong> renews on <strong>${escapeHtml(args.renewsOn)}</strong> for ${formatMoney(args.amountCents)}.`) +
      p(`No action is needed — we'll charge your payment method on file.`) +
      button("Manage billing", args.manageUrl),
  };
}

export function subscriptionCancelledEmail(args: { businessName: string; accessUntil?: string; reactivateUrl: string }): BuiltEmail {
  return {
    category: "BILLING",
    template: "subscription_cancelled",
    subject: "Your PageBee subscription was cancelled",
    preheader: "Sorry to see you go — here's what happens next.",
    body:
      h("Subscription cancelled") +
      p(`Your PageBee subscription for <strong>${escapeHtml(args.businessName)}</strong> has been cancelled.${args.accessUntil ? ` You'll keep access until <strong>${escapeHtml(args.accessUntil)}</strong>.` : ""}`) +
      p(`Changed your mind? You can reactivate any time.`) +
      button("Reactivate", args.reactivateUrl),
  };
}

export function planChangedEmail(args: { businessName: string; fromPlan: string; toPlan: string; dashboardUrl: string }): BuiltEmail {
  return {
    category: "ACCOUNT",
    template: "plan_changed",
    subject: `Your PageBee plan is now ${args.toPlan}`,
    preheader: `Plan changed from ${args.fromPlan} to ${args.toPlan}.`,
    body:
      h("Your plan was updated") +
      p(`Your plan for <strong>${escapeHtml(args.businessName)}</strong> changed from <strong>${escapeHtml(args.fromPlan)}</strong> to <strong>${escapeHtml(args.toPlan)}</strong>.`) +
      button("See what's included", args.dashboardUrl),
  };
}

// — Website lifecycle ---------------------------------------------------------

export function previewReadyEmail(args: { businessName: string; reviewUrl: string }): BuiltEmail {
  return {
    category: "WEBSITE",
    template: "preview_ready",
    subject: "Your website preview is ready to review 🎉",
    preheader: "Take a look and approve it to go live.",
    body:
      h("Your website preview is ready") +
      p(`We've built a preview of the website for <strong>${escapeHtml(args.businessName)}</strong>. Review it, request any changes, and approve it to publish.`) +
      button("Review your preview", args.reviewUrl),
  };
}

export function sitePublishedEmail(args: { businessName: string; siteUrl: string }): BuiltEmail {
  return {
    category: "WEBSITE",
    template: "site_published",
    subject: "Your website is live 🚀",
    preheader: "Your PageBee website is now published.",
    body:
      h("You're live!") +
      p(`The website for <strong>${escapeHtml(args.businessName)}</strong> is now published and available to your customers.`) +
      button("Visit your website", args.siteUrl),
  };
}

export function updateApprovedEmail(args: { businessName: string; siteUrl: string }): BuiltEmail {
  return {
    category: "WEBSITE",
    template: "update_approved",
    subject: "Your website update is live",
    preheader: "The changes you approved are now published.",
    body:
      h("Update published") +
      p(`The latest changes to the website for <strong>${escapeHtml(args.businessName)}</strong> are now live.`) +
      button("View your website", args.siteUrl),
  };
}

export function updateRejectedEmail(args: { businessName: string; reason?: string; dashboardUrl: string }): BuiltEmail {
  return {
    category: "WEBSITE",
    template: "update_rejected",
    subject: "About your recent website change request",
    preheader: "We need a little more from you on this update.",
    body:
      h("We couldn't apply that change") +
      p(`We weren't able to apply the recent change request for <strong>${escapeHtml(args.businessName)}</strong>.${args.reason ? ` <br/><br/><em>${escapeHtml(args.reason)}</em>` : ""}`) +
      button("Open your dashboard", args.dashboardUrl),
  };
}

// — Usage / reminders ---------------------------------------------------------

export function quotaWarningEmail(args: { businessName: string; metric: string; used: number; limit: number; upgradeUrl: string }): BuiltEmail {
  const pct = Math.round((args.used / Math.max(1, args.limit)) * 100);
  return {
    category: "USAGE",
    template: "quota_warning",
    subject: `You've used ${pct}% of your monthly ${args.metric}`,
    preheader: `${args.used} of ${args.limit} ${args.metric} used this month.`,
    body:
      h(`You're approaching your ${escapeHtml(args.metric)} limit`) +
      p(`For <strong>${escapeHtml(args.businessName)}</strong>, you've used <strong>${args.used} of ${args.limit}</strong> ${escapeHtml(args.metric)} this month (${pct}%).`) +
      p(`Upgrade to keep things running smoothly without hitting your limit.`) +
      button("See upgrade options", args.upgradeUrl),
  };
}

export function setupFeePendingEmail(args: { businessName: string; payUrl: string }): BuiltEmail {
  return {
    category: "USAGE",
    template: "setup_fee_pending",
    subject: "One step left to launch your website",
    preheader: "Complete your setup payment to go live.",
    body:
      h("Ready to go live?") +
      p(`Your website for <strong>${escapeHtml(args.businessName)}</strong> is approved and waiting. Complete your one-time setup payment and we'll publish it right away.`) +
      button("Complete setup & launch", args.payUrl),
  };
}

export function previewAutoReleaseReminderEmail(args: { businessName: string; reviewUrl: string; hoursLeft: number }): BuiltEmail {
  return {
    category: "USAGE",
    template: "preview_auto_release_reminder",
    subject: "Your website preview is waiting for you",
    preheader: `Review it within ${args.hoursLeft}h before it's released to you automatically.`,
    body:
      h("Don't forget your preview") +
      p(`The website preview for <strong>${escapeHtml(args.businessName)}</strong> is ready and waiting for your review.`) +
      button("Review now", args.reviewUrl),
  };
}
