import { formatMoney } from "@/lib/modules/finance/money";
import type { EmailCategory } from "@prisma/client";
import { escapeHtml } from "./send";
import { button, linkFallback, panel, detailTable, usageBar } from "./layout";

export interface BuiltEmail {
  subject: string;
  preheader: string;
  body: string; // inner HTML for renderLayout
  category: EmailCategory;
  template: string; // trigger key recorded on EmailLog
}

const p = (html: string) => `<p style="margin:0 0 14px">${html}</p>`;
const h = (text: string) =>
  `<h1 style="margin:0 0 18px;font-size:23px;font-weight:800;letter-spacing:-0.02em;color:#1c1917;line-height:1.25">${escapeHtml(text)}</h1>`;
const firstName = (name?: string | null) => (name ? name.trim().split(/\s+/)[0] : "");
/** Optional "Hi {first}," opener — omitted entirely when no name is known. */
const greet = (name?: string | null) => (firstName(name) ? p(`Hi ${escapeHtml(firstName(name))},`) : "");
/** Muted fine-print line. */
const note = (html: string) => `<p style="margin:14px 0 0;color:#a8a29e;font-size:12.5px;line-height:1.55">${html}</p>`;
/** A soft "if this wasn't you" security warning panel. */
const warn = (html: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 6px"><tr><td style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:14px 16px;color:#991b1b;font-size:13.5px;line-height:1.55">${html}</td></tr></table>`;
const SUPPORT = (url: string) => `<a href="${url}" style="color:#b45309;font-weight:600">contact our team</a>`;

// — Onboarding ----------------------------------------------------------------

export function welcomeEmail(args: { businessName: string; ownerName?: string | null; dashboardUrl: string }): BuiltEmail {
  const fn = firstName(args.ownerName);
  return {
    category: "WELCOME",
    template: "welcome",
    subject: fn ? `Welcome to PageBee, ${fn} 🐝` : "Welcome to PageBee 🐝",
    preheader: `Your account for ${args.businessName} is set up — create your website in a few clicks.`,
    body:
      h(fn ? `Welcome aboard, ${fn} 👋` : "Welcome aboard 👋") +
      p(`Your PageBee account for <strong>${escapeHtml(args.businessName)}</strong> is all set up. 🎉`) +
      p(`You're ready to create your website. It takes just a couple of clicks — answer a few quick questions about your business and we'll generate a preview for you on the spot.`) +
      button("Create your website", args.dashboardUrl) +
      panel(
        `<strong style="color:#1c1917">What happens next?</strong><br/>Answer a few simple questions, and PageBee builds your website preview in seconds. Review it, request any tweaks, and approve it to go live — no design skills needed.`,
      ),
  };
}

/**
 * Invitation for a newly provisioned commission sales rep. Carries a secure set-password link
 * (the password-reset flow, longer-lived) so the rep chooses their own credentials, plus a pointer
 * to sign the commission agreement in the portal. No plaintext password is ever emailed.
 */
export function repInviteEmail(args: { name?: string | null; setPasswordUrl: string; portalUrl: string; expiresDays: number }): BuiltEmail {
  return {
    category: "ACCOUNT",
    template: "rep_invite",
    subject: "You're invited to the PageBee sales team 🐝",
    preheader: "Set your password to access the rep portal and sign your commission agreement.",
    body:
      h("Welcome to the PageBee sales team 👋") +
      greet(args.name) +
      p(`An account has been created for you on the PageBee rep portal. To get started, set your password with the secure link below — it expires in <strong>${args.expiresDays} days</strong>.`) +
      button("Set your password", args.setPasswordUrl) +
      linkFallback(args.setPasswordUrl) +
      p(`Once you're in, sign your commission agreement and you're ready to start selling. You can sign in any time at <a href="${args.portalUrl}" style="color:#b45309;font-weight:600">${escapeHtml(args.portalUrl)}</a>.`) +
      note(`If you weren't expecting this invitation, you can safely ignore this email.`),
  };
}

/**
 * Confirmation that a rep e-signed their commission agreement. The signed PDF is attached by the
 * caller (sendRepContractSigned); this is the covering message + a link back to the portal copy.
 */
export function repContractSignedEmail(args: { name?: string | null; portalUrl: string }): BuiltEmail {
  return {
    category: "ACCOUNT",
    template: "rep_contract_signed",
    subject: "Your PageBee commission agreement — signed copy 🐝",
    preheader: "A PDF copy of your signed agreement is attached for your records.",
    body:
      h("Your agreement is signed ✅") +
      greet(args.name) +
      p(`Thanks for signing your PageBee Sales-Rep Commission Agreement — you're cleared to start selling. 🎉`) +
      p(`A <strong>PDF copy is attached</strong> for your records. You can also download it any time from your agreement page in the portal.`) +
      button("View your agreement", args.portalUrl) +
      note(`Keep this copy somewhere safe. If you have any questions about your terms, reach out to your manager.`),
  };
}

// — Auth / security -----------------------------------------------------------

export function passwordResetEmail(args: { name?: string | null; resetUrl: string; expiresMinutes: number }): BuiltEmail {
  return {
    category: "AUTH",
    template: "password_reset",
    subject: "Reset your PageBee password",
    preheader: `Choose a new password — this secure link expires in ${args.expiresMinutes} minutes.`,
    body:
      h("Reset your password") +
      greet(args.name) +
      p(`We got a request to reset the password for your PageBee account. Choose a new one below — the link expires in <strong>${args.expiresMinutes} minutes</strong>.`) +
      button("Choose a new password", args.resetUrl) +
      linkFallback(args.resetUrl) +
      note(`Didn't ask for this? You can safely ignore this email — your password stays the same until you use the link above.`),
  };
}

export function emailVerifyEmail(args: { name?: string | null; verifyUrl: string }): BuiltEmail {
  return {
    category: "AUTH",
    template: "email_verify",
    subject: "Confirm your email for PageBee",
    preheader: "One quick tap to verify your email address.",
    body:
      h("Confirm your email") +
      greet(args.name) +
      p(`Please confirm this is your email address so we can keep your PageBee account secure and reach you about anything important.`) +
      button("Verify email", args.verifyUrl) +
      linkFallback(args.verifyUrl) +
      note(`If you didn't create a PageBee account, you can ignore this email.`),
  };
}

export function passwordChangedEmail(args: { name?: string | null; supportUrl: string }): BuiltEmail {
  return {
    category: "ACCOUNT",
    template: "password_changed",
    subject: "Your PageBee password was changed",
    preheader: "A heads-up about a change to your account.",
    body:
      h("Your password was changed") +
      greet(args.name) +
      p(`This is a confirmation that your PageBee password was just changed. If this was you, you're all set — no action needed.`) +
      warn(`<strong>Didn't change it?</strong> Your account may be at risk. Reset your password and ${SUPPORT(args.supportUrl)} right away.`),
  };
}

export function emailChangedEmail(args: { name?: string | null; newEmail: string; supportUrl: string }): BuiltEmail {
  return {
    category: "ACCOUNT",
    template: "email_changed",
    subject: "Your PageBee sign-in email was changed",
    preheader: "A heads-up about a change to your account.",
    body:
      h("Your sign-in email was changed") +
      greet(args.name) +
      p(`The email address used to sign in to PageBee was changed to:`) +
      detailTable([["New email", `<span style="font-weight:700">${escapeHtml(args.newEmail)}</span>`]]) +
      warn(`<strong>Didn't make this change?</strong> Please ${SUPPORT(args.supportUrl)} immediately so we can secure your account.`),
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
      p(`We noticed a new sign-in to your PageBee account. If this was you, no action is needed.`) +
      detailTable([
        ["When", escapeHtml(args.when)],
        ["Device", escapeHtml(args.context)],
      ]) +
      warn(`<strong>Wasn't you?</strong> Change your password and ${SUPPORT(args.supportUrl)} to lock things down.`),
  };
}

// — Billing -------------------------------------------------------------------

export function paymentReceiptEmail(args: {
  businessName: string;
  ownerName?: string | null;
  amountCents: number;
  description: string;
  when: string;
  invoiceUrl?: string;
}): BuiltEmail {
  return {
    category: "BILLING",
    template: "payment_receipt",
    subject: `Receipt from PageBee — ${formatMoney(args.amountCents)}`,
    preheader: `Thanks! We received your payment of ${formatMoney(args.amountCents)}.`,
    body:
      h("Payment received — thank you 🙌") +
      greet(args.ownerName) +
      p(`We've received your payment for <strong>${escapeHtml(args.businessName)}</strong>. Here are the details for your records:`) +
      detailTable([
        ["Amount", `<span style="font-size:16px">${formatMoney(args.amountCents)}</span>`],
        ["For", escapeHtml(args.description)],
        ["Date", escapeHtml(args.when)],
        ["Business", escapeHtml(args.businessName)],
      ]) +
      (args.invoiceUrl ? button("View receipt", args.invoiceUrl) : ""),
  };
}

export function paymentFailedEmail(args: {
  businessName: string;
  ownerName?: string | null;
  amountCents: number;
  attempt: number;
  updatePaymentUrl: string;
}): BuiltEmail {
  return {
    category: "BILLING",
    template: "payment_failed",
    subject: "Action needed: your PageBee payment didn't go through",
    preheader: "Update your payment method to keep your website and services running.",
    body:
      h("We couldn't process your payment") +
      greet(args.ownerName) +
      p(`We tried to charge the ${formatMoney(args.amountCents)} payment for <strong>${escapeHtml(args.businessName)}</strong>, but it didn't go through (attempt ${args.attempt}).`) +
      p(`Updating your payment method takes a minute and keeps your website and services running without interruption.`) +
      button("Update payment method", args.updatePaymentUrl) +
      note(`We'll automatically retry over the next few days. If your card details are current, you can ignore this — the retry may already have succeeded.`),
  };
}

export function renewalNoticeEmail(args: { businessName: string; ownerName?: string | null; amountCents: number; renewsOn: string; manageUrl: string }): BuiltEmail {
  return {
    category: "BILLING",
    template: "renewal_notice",
    subject: `Your PageBee plan renews on ${args.renewsOn}`,
    preheader: `Heads-up: ${formatMoney(args.amountCents)} will be charged on ${args.renewsOn}.`,
    body:
      h("Your plan renews soon") +
      greet(args.ownerName) +
      p(`Just a friendly heads-up about the upcoming renewal for <strong>${escapeHtml(args.businessName)}</strong>:`) +
      detailTable([
        ["Renews on", escapeHtml(args.renewsOn)],
        ["Amount", `<span style="font-size:16px">${formatMoney(args.amountCents)}</span>`],
      ]) +
      p(`No action needed — we'll charge the payment method on file. You can review or update your billing any time.`) +
      button("Manage billing", args.manageUrl),
  };
}

export function subscriptionCancelledEmail(args: { businessName: string; ownerName?: string | null; accessUntil?: string; reactivateUrl: string }): BuiltEmail {
  return {
    category: "BILLING",
    template: "subscription_cancelled",
    subject: "Your PageBee subscription was cancelled",
    preheader: "Sorry to see you go — your details are here if you change your mind.",
    body:
      h("Your subscription was cancelled") +
      greet(args.ownerName) +
      p(`We've cancelled the PageBee subscription for <strong>${escapeHtml(args.businessName)}</strong>.${args.accessUntil ? ` You'll keep full access until <strong>${escapeHtml(args.accessUntil)}</strong>.` : ""}`) +
      p(`We'd genuinely love to have you back — your website and settings will be waiting if you reactivate.`) +
      button("Reactivate my plan", args.reactivateUrl) +
      note(`Mind sharing why you left? Just reply to this email — we read every response.`),
  };
}

export function planChangedEmail(args: { businessName: string; ownerName?: string | null; fromPlan: string; toPlan: string; dashboardUrl: string }): BuiltEmail {
  return {
    category: "ACCOUNT",
    template: "plan_changed",
    subject: `Your PageBee plan is now ${args.toPlan}`,
    preheader: `Plan updated from ${args.fromPlan} to ${args.toPlan}.`,
    body:
      h("Your plan was updated 🎉") +
      greet(args.ownerName) +
      p(`The plan for <strong>${escapeHtml(args.businessName)}</strong> has been updated:`) +
      detailTable([
        ["Previous plan", escapeHtml(args.fromPlan)],
        ["New plan", `<span style="font-weight:700">${escapeHtml(args.toPlan)}</span>`],
      ]) +
      p(`Your new features are ready to use right now.`) +
      button("See what's included", args.dashboardUrl),
  };
}

// — Website lifecycle ---------------------------------------------------------

export function previewReadyEmail(args: { businessName: string; ownerName?: string | null; reviewUrl: string }): BuiltEmail {
  return {
    category: "WEBSITE",
    template: "preview_ready",
    subject: "Your website preview is ready to review 🎉",
    preheader: "Take a look, request any tweaks, and approve it to go live.",
    body:
      h("Your website preview is ready 🎉") +
      greet(args.ownerName) +
      p(`Your new website for <strong>${escapeHtml(args.businessName)}</strong> is built and ready for you to review.`) +
      button("Review your preview", args.reviewUrl) +
      panel(
        `<strong style="color:#1c1917">Your move:</strong><br/>Look it over, ask for any changes you'd like, then approve it to publish. It's your site — we won't take it live until you're happy.`,
      ),
  };
}

export function sitePublishedEmail(args: { businessName: string; ownerName?: string | null; siteUrl: string }): BuiltEmail {
  return {
    category: "WEBSITE",
    template: "site_published",
    subject: "Your website is live 🚀",
    preheader: `${args.businessName} is now online and open for business.`,
    body:
      h("You're live! 🚀") +
      greet(args.ownerName) +
      p(`The website for <strong>${escapeHtml(args.businessName)}</strong> is now published and open to your customers. Congratulations!`) +
      detailTable([["Your website", `<a href="${args.siteUrl}" style="color:#b45309;font-weight:700">${escapeHtml(args.siteUrl.replace(/^https?:\/\//, ""))}</a>`]]) +
      button("Visit your website", args.siteUrl) +
      note(`Tip: share your link on social media and add it to your Google Business Profile to start bringing in visitors.`),
  };
}

export function updateApprovedEmail(args: { businessName: string; ownerName?: string | null; siteUrl: string }): BuiltEmail {
  return {
    category: "WEBSITE",
    template: "update_approved",
    subject: "Your website update is live ✅",
    preheader: "The changes you approved are now published.",
    body:
      h("Your update is live ✅") +
      greet(args.ownerName) +
      p(`The latest changes to the website for <strong>${escapeHtml(args.businessName)}</strong> have been published and are live now.`) +
      button("View your website", args.siteUrl),
  };
}

export function updateRejectedEmail(args: { businessName: string; ownerName?: string | null; reason?: string; dashboardUrl: string }): BuiltEmail {
  return {
    category: "WEBSITE",
    template: "update_rejected",
    subject: "About your recent website change request",
    preheader: "We need a little more from you to finish this update.",
    body:
      h("We need a hand with your change") +
      greet(args.ownerName) +
      p(`We weren't able to apply your recent change request for <strong>${escapeHtml(args.businessName)}</strong> just yet.`) +
      (args.reason ? panel(`<strong style="color:#1c1917">Here's why:</strong><br/>${escapeHtml(args.reason)}`) : "") +
      p(`Pop into your dashboard to adjust the request and resubmit — we're happy to help.`) +
      button("Open your dashboard", args.dashboardUrl),
  };
}

// — Usage / reminders ---------------------------------------------------------

export function quotaWarningEmail(args: { businessName: string; ownerName?: string | null; metric: string; used: number; limit: number; upgradeUrl: string }): BuiltEmail {
  const pct = Math.round((args.used / Math.max(1, args.limit)) * 100);
  return {
    category: "USAGE",
    template: "quota_warning",
    subject: `You've used ${pct}% of your monthly ${args.metric}`,
    preheader: `${args.used} of ${args.limit} ${args.metric} used this month — upgrade for more headroom.`,
    body:
      h(`You're nearing your ${escapeHtml(args.metric)} limit`) +
      greet(args.ownerName) +
      p(`For <strong>${escapeHtml(args.businessName)}</strong>, you've used <strong>${args.used} of ${args.limit}</strong> ${escapeHtml(args.metric)} this month — that's ${pct}%.`) +
      usageBar(pct) +
      p(`Upgrade your plan to raise the limit and keep everything running without a hitch.`) +
      button("See upgrade options", args.upgradeUrl),
  };
}

export function setupFeePendingEmail(args: { businessName: string; ownerName?: string | null; payUrl: string }): BuiltEmail {
  return {
    category: "USAGE",
    template: "setup_fee_pending",
    subject: "One step left to launch your website",
    preheader: "Complete your one-time setup payment and we'll publish your site.",
    body:
      h("You're one step from going live") +
      greet(args.ownerName) +
      p(`Your website for <strong>${escapeHtml(args.businessName)}</strong> is approved and ready to publish. All that's left is your one-time setup payment — then we'll take it live right away.`) +
      button("Complete setup & launch", args.payUrl) +
      note(`Questions before you launch? Just reply to this email.`),
  };
}

export function previewAutoReleaseReminderEmail(args: { businessName: string; ownerName?: string | null; reviewUrl: string; hoursLeft: number }): BuiltEmail {
  return {
    category: "USAGE",
    template: "preview_auto_release_reminder",
    subject: "Your website preview is waiting for you",
    preheader: `Review it within ${args.hoursLeft}h, or we'll release it to you automatically.`,
    body:
      h("Your preview is waiting 👀") +
      greet(args.ownerName) +
      p(`The website preview for <strong>${escapeHtml(args.businessName)}</strong> is ready and waiting for your review.`) +
      button("Review now", args.reviewUrl) +
      note(`If we don't hear from you within ${args.hoursLeft} hours, we'll release the preview to your account automatically so you can take it from there.`),
  };
}
