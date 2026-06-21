import { dispatchToCustomer } from "./tenant-dispatch";
import { resolveClientBrand } from "./tenant-sender";
import type { EmailAttachment } from "./send";
import * as ct from "./customer-templates";

interface BrandLite {
  businessName: string;
  accent: string;
  customerName?: string | null;
}

/**
 * Resolve the client's brand, build a customer template, and dispatch it through
 * the tenant funnel (consent + branding + sending domain + logging). Fail-soft —
 * customer email must never block the underlying business action.
 */
async function sendCustomer(params: {
  clientId: string;
  to: string | null | undefined;
  customerId?: string | null;
  customerName?: string | null;
  attachments?: EmailAttachment[];
  build: (b: BrandLite) => ct.CustomerEmail;
}): Promise<void> {
  if (!params.to) return;
  try {
    const brand = await resolveClientBrand(params.clientId);
    if (!brand) return;
    const e = params.build({ businessName: brand.businessName, accent: brand.primaryColor, customerName: params.customerName });
    await dispatchToCustomer({
      clientId: params.clientId,
      to: params.to,
      customerId: params.customerId ?? null,
      subject: e.subject,
      body: e.body,
      preheader: e.preheader,
      category: e.category,
      template: e.template,
      attachments: params.attachments,
      brand,
    });
  } catch (err) {
    console.error(`[email:customer] send failed for client ${params.clientId}`, err);
  }
}

// — Inquiry & booking lifecycle ----------------------------------------------

export const sendInquiryAck = (clientId: string, a: { to?: string | null; customerId?: string | null; customerName?: string | null; message?: string | null }) =>
  sendCustomer({ clientId, to: a.to, customerId: a.customerId, customerName: a.customerName, build: (b) => ct.inquiryAckEmail({ ...b, message: a.message }) });

export const sendAppointmentConfirmation = (clientId: string, a: { to?: string | null; customerId?: string | null; customerName?: string | null; serviceName: string; when: string; manageUrl?: string }) =>
  sendCustomer({ clientId, to: a.to, customerId: a.customerId, customerName: a.customerName, build: (b) => ct.appointmentConfirmationEmail({ ...b, serviceName: a.serviceName, when: a.when, manageUrl: a.manageUrl }) });

export const sendAppointmentReminder = (clientId: string, a: { to?: string | null; customerId?: string | null; customerName?: string | null; serviceName: string; when: string; manageUrl?: string }) =>
  sendCustomer({ clientId, to: a.to, customerId: a.customerId, customerName: a.customerName, build: (b) => ct.appointmentReminderEmail({ ...b, serviceName: a.serviceName, when: a.when, manageUrl: a.manageUrl }) });

export const sendAppointmentRescheduled = (clientId: string, a: { to?: string | null; customerId?: string | null; customerName?: string | null; serviceName: string; when: string; manageUrl?: string }) =>
  sendCustomer({ clientId, to: a.to, customerId: a.customerId, customerName: a.customerName, build: (b) => ct.appointmentRescheduledEmail({ ...b, serviceName: a.serviceName, when: a.when, manageUrl: a.manageUrl }) });

export const sendAppointmentCancelled = (clientId: string, a: { to?: string | null; customerId?: string | null; customerName?: string | null; serviceName: string; when: string; rebookUrl?: string }) =>
  sendCustomer({ clientId, to: a.to, customerId: a.customerId, customerName: a.customerName, build: (b) => ct.appointmentCancelledEmail({ ...b, serviceName: a.serviceName, when: a.when, rebookUrl: a.rebookUrl }) });

export const sendAppointmentFollowUp = (clientId: string, a: { to?: string | null; customerId?: string | null; customerName?: string | null; serviceName: string; rebookUrl?: string }) =>
  sendCustomer({ clientId, to: a.to, customerId: a.customerId, customerName: a.customerName, build: (b) => ct.appointmentFollowUpEmail({ ...b, serviceName: a.serviceName, rebookUrl: a.rebookUrl }) });

// — Billing to customers ------------------------------------------------------

export const sendEstimateSent = (clientId: string, a: { to?: string | null; customerId?: string | null; customerName?: string | null; number: string; amountCents: number; currency?: string; viewUrl: string; expiresOn?: string; attachments?: EmailAttachment[] }) =>
  sendCustomer({ clientId, to: a.to, customerId: a.customerId, customerName: a.customerName, attachments: a.attachments, build: (b) => ct.estimateSentEmail({ ...b, number: a.number, amountCents: a.amountCents, currency: a.currency, viewUrl: a.viewUrl, expiresOn: a.expiresOn }) });

export const sendEstimateExpiring = (clientId: string, a: { to?: string | null; customerId?: string | null; customerName?: string | null; number: string; viewUrl: string; expiresOn: string }) =>
  sendCustomer({ clientId, to: a.to, customerId: a.customerId, customerName: a.customerName, build: (b) => ct.estimateExpiringEmail({ ...b, number: a.number, viewUrl: a.viewUrl, expiresOn: a.expiresOn }) });

export const sendInvoiceSent = (clientId: string, a: { to?: string | null; customerId?: string | null; customerName?: string | null; number: string; amountCents: number; currency?: string; dueOn?: string; viewUrl: string; attachments?: EmailAttachment[] }) =>
  sendCustomer({ clientId, to: a.to, customerId: a.customerId, customerName: a.customerName, attachments: a.attachments, build: (b) => ct.invoiceSentEmail({ ...b, number: a.number, amountCents: a.amountCents, currency: a.currency, dueOn: a.dueOn, viewUrl: a.viewUrl }) });

export const sendCustomerPaymentReceipt = (clientId: string, a: { to?: string | null; customerId?: string | null; customerName?: string | null; number: string; amountCents: number; currency?: string; when: string; viewUrl?: string }) =>
  sendCustomer({ clientId, to: a.to, customerId: a.customerId, customerName: a.customerName, build: (b) => ct.customerPaymentReceiptEmail({ ...b, number: a.number, amountCents: a.amountCents, currency: a.currency, when: a.when, viewUrl: a.viewUrl }) });

export const sendInvoiceOverdue = (clientId: string, a: { to?: string | null; customerId?: string | null; customerName?: string | null; number: string; amountCents: number; currency?: string; dueOn: string; viewUrl: string }) =>
  sendCustomer({ clientId, to: a.to, customerId: a.customerId, customerName: a.customerName, build: (b) => ct.invoiceOverdueEmail({ ...b, number: a.number, amountCents: a.amountCents, currency: a.currency, dueOn: a.dueOn, viewUrl: a.viewUrl }) });

export const sendStatement = (clientId: string, a: { to?: string | null; customerId?: string | null; customerName?: string | null; period: string; balanceCents: number; currency?: string; viewUrl: string }) =>
  sendCustomer({ clientId, to: a.to, customerId: a.customerId, customerName: a.customerName, build: (b) => ct.statementEmail({ ...b, period: a.period, balanceCents: a.balanceCents, currency: a.currency, viewUrl: a.viewUrl }) });

// — Review request ------------------------------------------------------------

export const sendReviewRequest = (clientId: string, a: { to?: string | null; customerId?: string | null; customerName?: string | null; reviewUrl: string; serviceName?: string }) =>
  sendCustomer({ clientId, to: a.to, customerId: a.customerId, customerName: a.customerName, build: (b) => ct.reviewRequestEmail({ ...b, reviewUrl: a.reviewUrl, serviceName: a.serviceName }) });

// — Re-engagement & promos (marketing — consent-gated in dispatch) ------------

export const sendWinBack = (clientId: string, a: { to?: string | null; customerId: string; customerName?: string | null; offer?: string; ctaUrl: string }) =>
  sendCustomer({ clientId, to: a.to, customerId: a.customerId, customerName: a.customerName, build: (b) => ct.winBackEmail({ ...b, offer: a.offer, ctaUrl: a.ctaUrl }) });

export const sendPromotion = (clientId: string, a: { to?: string | null; customerId: string; customerName?: string | null; headline: string; details: string; ctaLabel: string; ctaUrl: string }) =>
  sendCustomer({ clientId, to: a.to, customerId: a.customerId, customerName: a.customerName, build: (b) => ct.promotionEmail({ ...b, headline: a.headline, details: a.details, ctaLabel: a.ctaLabel, ctaUrl: a.ctaUrl }) });

export const sendBirthday = (clientId: string, a: { to?: string | null; customerId: string; customerName?: string | null; offer?: string; ctaUrl: string }) =>
  sendCustomer({ clientId, to: a.to, customerId: a.customerId, customerName: a.customerName, build: (b) => ct.birthdayEmail({ ...b, offer: a.offer, ctaUrl: a.ctaUrl }) });
