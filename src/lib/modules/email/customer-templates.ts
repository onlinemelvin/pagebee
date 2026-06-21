import { formatMoney } from "@/lib/modules/finance/money";
import type { EmailCategory } from "@prisma/client";
import { escapeHtml } from "./send";
import { detailTable } from "./layout";
import { tButton, tPanel } from "./tenant-layout";

export interface CustomerEmail {
  subject: string;
  preheader: string;
  body: string;
  category: EmailCategory;
  template: string;
}

const p = (html: string) => `<p style="margin:0 0 14px">${html}</p>`;
const h = (text: string) =>
  `<h1 style="margin:0 0 18px;font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#1c1917;line-height:1.25">${escapeHtml(text)}</h1>`;
const firstName = (name?: string | null) => (name ? name.trim().split(/\s+/)[0] : "");
const greet = (name?: string | null) => (firstName(name) ? p(`Hi ${escapeHtml(firstName(name))},`) : p("Hi there,"));
const note = (html: string) => `<p style="margin:14px 0 0;color:#a8a29e;font-size:12.5px;line-height:1.55">${html}</p>`;
const sign = (business: string) => p(`— The team at <strong>${escapeHtml(business)}</strong>`);

interface Base {
  businessName: string;
  accent: string;
  customerName?: string | null;
}

// — Inquiry & booking lifecycle ----------------------------------------------

export function inquiryAckEmail(args: Base & { message?: string | null }): CustomerEmail {
  return {
    category: "CUSTOMER_INQUIRY",
    template: "customer_inquiry_ack",
    subject: `We received your message — ${args.businessName}`,
    preheader: `Thanks for reaching out to ${args.businessName}. We'll be in touch shortly.`,
    body:
      h("Thanks for getting in touch! 👋") +
      greet(args.customerName) +
      p(`We've received your message and a member of our team will get back to you as soon as possible — usually within one business day.`) +
      (args.message ? tPanel(`<strong style="color:#1c1917">Your message</strong><br/>${escapeHtml(args.message)}`) : "") +
      p(`We appreciate you reaching out and look forward to helping you.`) +
      sign(args.businessName),
  };
}

export function appointmentConfirmationEmail(args: Base & { serviceName: string; when: string; manageUrl?: string }): CustomerEmail {
  return {
    category: "CUSTOMER_APPOINTMENT",
    template: "customer_appointment_confirmed",
    subject: `Your appointment is confirmed — ${args.when}`,
    preheader: `You're booked with ${args.businessName} for ${args.serviceName}.`,
    body:
      h("Your appointment is confirmed ✅") +
      greet(args.customerName) +
      p(`Great news — your appointment with <strong>${escapeHtml(args.businessName)}</strong> is confirmed. Here are the details:`) +
      detailTable([
        ["Service", escapeHtml(args.serviceName)],
        ["When", `<span style="font-weight:700">${escapeHtml(args.when)}</span>`],
      ]) +
      (args.manageUrl ? tButton("View or reschedule", args.manageUrl, args.accent) : "") +
      p(`We look forward to seeing you!`) +
      sign(args.businessName),
  };
}

export function appointmentReminderEmail(args: Base & { serviceName: string; when: string; manageUrl?: string }): CustomerEmail {
  return {
    category: "CUSTOMER_APPOINTMENT",
    template: "customer_appointment_reminder",
    subject: `Reminder: your appointment is coming up — ${args.when}`,
    preheader: `A friendly reminder of your appointment with ${args.businessName}.`,
    body:
      h("See you soon! ⏰") +
      greet(args.customerName) +
      p(`This is a friendly reminder of your upcoming appointment with <strong>${escapeHtml(args.businessName)}</strong>:`) +
      detailTable([
        ["Service", escapeHtml(args.serviceName)],
        ["When", `<span style="font-weight:700">${escapeHtml(args.when)}</span>`],
      ]) +
      (args.manageUrl ? tButton("Need to reschedule?", args.manageUrl, args.accent) : "") +
      sign(args.businessName),
  };
}

export function appointmentRescheduledEmail(args: Base & { serviceName: string; when: string; manageUrl?: string }): CustomerEmail {
  return {
    category: "CUSTOMER_APPOINTMENT",
    template: "customer_appointment_rescheduled",
    subject: `Your appointment has been rescheduled — ${args.when}`,
    preheader: `Your appointment with ${args.businessName} has a new time.`,
    body:
      h("Your appointment was rescheduled") +
      greet(args.customerName) +
      p(`Your appointment with <strong>${escapeHtml(args.businessName)}</strong> has a new time:`) +
      detailTable([
        ["Service", escapeHtml(args.serviceName)],
        ["New time", `<span style="font-weight:700">${escapeHtml(args.when)}</span>`],
      ]) +
      (args.manageUrl ? tButton("View appointment", args.manageUrl, args.accent) : "") +
      sign(args.businessName),
  };
}

export function appointmentCancelledEmail(args: Base & { serviceName: string; when: string; rebookUrl?: string }): CustomerEmail {
  return {
    category: "CUSTOMER_APPOINTMENT",
    template: "customer_appointment_cancelled",
    subject: `Your appointment has been cancelled`,
    preheader: `Your ${args.serviceName} appointment with ${args.businessName} was cancelled.`,
    body:
      h("Your appointment was cancelled") +
      greet(args.customerName) +
      p(`Your appointment with <strong>${escapeHtml(args.businessName)}</strong> for <strong>${escapeHtml(args.serviceName)}</strong> on ${escapeHtml(args.when)} has been cancelled.`) +
      (args.rebookUrl ? p(`Need a new time? We'd be happy to get you rebooked.`) + tButton("Book again", args.rebookUrl, args.accent) : "") +
      sign(args.businessName),
  };
}

export function appointmentFollowUpEmail(args: Base & { serviceName: string; rebookUrl?: string }): CustomerEmail {
  return {
    category: "CUSTOMER_APPOINTMENT",
    template: "customer_appointment_followup",
    subject: `Thanks for visiting ${args.businessName}!`,
    preheader: `We hope you had a great experience with ${args.businessName}.`,
    body:
      h("Thanks for visiting! 🙏") +
      greet(args.customerName) +
      p(`Thank you for choosing <strong>${escapeHtml(args.businessName)}</strong> for your ${escapeHtml(args.serviceName)}. We hope you had a great experience.`) +
      (args.rebookUrl ? p(`Ready for your next visit? You can book any time.`) + tButton("Book your next visit", args.rebookUrl, args.accent) : "") +
      sign(args.businessName),
  };
}

// — Billing to customers ------------------------------------------------------

export function estimateSentEmail(args: Base & { number: string; amountCents: number; viewUrl: string; expiresOn?: string }): CustomerEmail {
  return {
    category: "CUSTOMER_BILLING",
    template: "customer_estimate_sent",
    subject: `Your estimate from ${args.businessName} (${args.number})`,
    preheader: `Estimate ${args.number} for ${formatMoney(args.amountCents)} is ready to view.`,
    body:
      h("Here's your estimate") +
      greet(args.customerName) +
      p(`Thanks for the opportunity to work with you. Please find your estimate from <strong>${escapeHtml(args.businessName)}</strong> below:`) +
      detailTable([
        ["Estimate", escapeHtml(args.number)],
        ["Total", `<span style="font-size:16px">${formatMoney(args.amountCents)}</span>`],
        ...(args.expiresOn ? [["Valid until", escapeHtml(args.expiresOn)] as [string, string]] : []),
      ]) +
      tButton("View estimate", args.viewUrl, args.accent) +
      p(`Have questions or ready to go ahead? Just reply to this email.`) +
      sign(args.businessName),
  };
}

export function estimateExpiringEmail(args: Base & { number: string; viewUrl: string; expiresOn: string }): CustomerEmail {
  return {
    category: "CUSTOMER_BILLING",
    template: "customer_estimate_expiring",
    subject: `Your estimate expires soon — ${args.number}`,
    preheader: `Estimate ${args.number} from ${args.businessName} is valid until ${args.expiresOn}.`,
    body:
      h("Your estimate expires soon") +
      greet(args.customerName) +
      p(`Just a reminder that your estimate <strong>${escapeHtml(args.number)}</strong> from <strong>${escapeHtml(args.businessName)}</strong> is valid until <strong>${escapeHtml(args.expiresOn)}</strong>.`) +
      tButton("Review estimate", args.viewUrl, args.accent) +
      p(`Ready to proceed, or have questions? We're here to help — just reply.`) +
      sign(args.businessName),
  };
}

export function invoiceSentEmail(args: Base & { number: string; amountCents: number; dueOn?: string; viewUrl: string }): CustomerEmail {
  return {
    category: "CUSTOMER_BILLING",
    template: "customer_invoice_sent",
    subject: `Invoice ${args.number} from ${args.businessName}`,
    preheader: `Invoice ${args.number} for ${formatMoney(args.amountCents)}${args.dueOn ? `, due ${args.dueOn}` : ""}.`,
    body:
      h("Here's your invoice") +
      greet(args.customerName) +
      p(`Thank you for your business! Here are the details of your invoice from <strong>${escapeHtml(args.businessName)}</strong>:`) +
      detailTable([
        ["Invoice", escapeHtml(args.number)],
        ["Amount due", `<span style="font-size:16px">${formatMoney(args.amountCents)}</span>`],
        ...(args.dueOn ? [["Due date", escapeHtml(args.dueOn)] as [string, string]] : []),
      ]) +
      tButton("View & pay invoice", args.viewUrl, args.accent) +
      note(`A PDF copy is attached for your records.`) +
      sign(args.businessName),
  };
}

export function customerPaymentReceiptEmail(args: Base & { number: string; amountCents: number; when: string; viewUrl?: string }): CustomerEmail {
  return {
    category: "CUSTOMER_BILLING",
    template: "customer_payment_receipt",
    subject: `Payment received — thank you! (${args.number})`,
    preheader: `We received your payment of ${formatMoney(args.amountCents)}. Thank you!`,
    body:
      h("Payment received — thank you! 🙌") +
      greet(args.customerName) +
      p(`We've received your payment to <strong>${escapeHtml(args.businessName)}</strong>. Here's your receipt:`) +
      detailTable([
        ["Invoice", escapeHtml(args.number)],
        ["Amount paid", `<span style="font-size:16px">${formatMoney(args.amountCents)}</span>`],
        ["Date", escapeHtml(args.when)],
      ]) +
      (args.viewUrl ? tButton("View receipt", args.viewUrl, args.accent) : "") +
      sign(args.businessName),
  };
}

export function invoiceOverdueEmail(args: Base & { number: string; amountCents: number; dueOn: string; viewUrl: string }): CustomerEmail {
  return {
    category: "CUSTOMER_BILLING",
    template: "customer_invoice_overdue",
    subject: `Reminder: invoice ${args.number} is past due`,
    preheader: `A gentle reminder about invoice ${args.number} from ${args.businessName}.`,
    body:
      h("A friendly payment reminder") +
      greet(args.customerName) +
      p(`This is a gentle reminder that invoice <strong>${escapeHtml(args.number)}</strong> from <strong>${escapeHtml(args.businessName)}</strong> was due on <strong>${escapeHtml(args.dueOn)}</strong>.`) +
      detailTable([["Amount due", `<span style="font-size:16px">${formatMoney(args.amountCents)}</span>`]]) +
      tButton("View & pay invoice", args.viewUrl, args.accent) +
      p(`If you've already paid, please disregard this — and thank you!`) +
      sign(args.businessName),
  };
}

export function statementEmail(args: Base & { period: string; balanceCents: number; viewUrl: string }): CustomerEmail {
  return {
    category: "CUSTOMER_BILLING",
    template: "customer_statement",
    subject: `Your account statement — ${args.period}`,
    preheader: `Your ${args.period} statement from ${args.businessName} is ready.`,
    body:
      h("Your account statement") +
      greet(args.customerName) +
      p(`Here's your account statement from <strong>${escapeHtml(args.businessName)}</strong> for <strong>${escapeHtml(args.period)}</strong>.`) +
      detailTable([["Balance", `<span style="font-size:16px">${formatMoney(args.balanceCents)}</span>`]]) +
      tButton("View statement", args.viewUrl, args.accent) +
      sign(args.businessName),
  };
}

// — Review request ------------------------------------------------------------

export function reviewRequestEmail(args: Base & { reviewUrl: string; serviceName?: string }): CustomerEmail {
  return {
    category: "CUSTOMER_REVIEW",
    template: "customer_review_request",
    subject: `How did we do, ${firstName(args.customerName) || "there"}?`,
    preheader: `Your feedback helps ${args.businessName} a lot — got 30 seconds?`,
    body:
      h("How did we do? ⭐") +
      greet(args.customerName) +
      p(`Thank you for choosing <strong>${escapeHtml(args.businessName)}</strong>${args.serviceName ? ` for your ${escapeHtml(args.serviceName)}` : ""}. We'd love to hear how it went.`) +
      p(`If you have 30 seconds, a quick review means the world to a local business like ours — and helps others find us.`) +
      tButton("Leave a review", args.reviewUrl, args.accent) +
      p(`Thank you so much for your support! 🙏`) +
      sign(args.businessName),
  };
}

// — Re-engagement & promos (marketing) ---------------------------------------

export function winBackEmail(args: Base & { offer?: string; ctaUrl: string }): CustomerEmail {
  return {
    category: "CUSTOMER_MARKETING",
    template: "customer_winback",
    subject: `We miss you at ${args.businessName}!`,
    preheader: `It's been a while — here's something to welcome you back.`,
    body:
      h("We miss you! 💛") +
      greet(args.customerName) +
      p(`It's been a little while since your last visit to <strong>${escapeHtml(args.businessName)}</strong>, and we'd love to see you again.`) +
      (args.offer ? tPanel(`<strong style="color:#1c1917">Just for you</strong><br/>${escapeHtml(args.offer)}`) : "") +
      tButton("Book your visit", args.ctaUrl, args.accent) +
      sign(args.businessName),
  };
}

export function promotionEmail(args: Base & { headline: string; details: string; ctaLabel: string; ctaUrl: string }): CustomerEmail {
  return {
    category: "CUSTOMER_MARKETING",
    template: "customer_promotion",
    subject: `${args.headline} — ${args.businessName}`,
    preheader: args.details.slice(0, 120),
    body:
      h(args.headline) +
      greet(args.customerName) +
      p(escapeHtml(args.details)) +
      tButton(args.ctaLabel, args.ctaUrl, args.accent) +
      sign(args.businessName),
  };
}

export function birthdayEmail(args: Base & { offer?: string; ctaUrl: string }): CustomerEmail {
  return {
    category: "CUSTOMER_MARKETING",
    template: "customer_birthday",
    subject: `Happy birthday from ${args.businessName}! 🎉`,
    preheader: `A little something to celebrate your day.`,
    body:
      h("Happy birthday! 🎂") +
      greet(args.customerName) +
      p(`Everyone at <strong>${escapeHtml(args.businessName)}</strong> wishes you a wonderful birthday!`) +
      (args.offer ? tPanel(`<strong style="color:#1c1817">Our gift to you</strong><br/>${escapeHtml(args.offer)}`) : "") +
      tButton("Treat yourself", args.ctaUrl, args.accent) +
      sign(args.businessName),
  };
}
