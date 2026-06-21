// PageBee platform email module. `sendEmail`/`escapeHtml` are the low-level
// primitives (kept for existing callers); most product code should call
// `dispatch()` or the high-level `notifications` helpers, which add EmailLog
// persistence, the branded layout, suppression, and the unsubscribe footer.
export { sendEmail, escapeHtml } from "./send";
export type { SendEmailParams, EmailAttachment } from "./send";

export { dispatch } from "./dispatch";
export type { DispatchParams, DispatchResult } from "./dispatch";

export { renderLayout, button, linkFallback, appBase } from "./layout";
export { isMarketing, MARKETING_CATEGORIES, CATEGORY_LABELS } from "./categories";

export {
  isSuppressed,
  unsubscribe,
  resubscribe,
  unsubscribeUrlFor,
  resolveUnsubscribeToken,
  suppressFromProvider,
} from "./preferences";

export * as templates from "./templates";
export type { BuiltEmail } from "./templates";

export * as notify from "./notifications";

export {
  resolveSegment,
  segmentCount,
  createCampaign,
  updateCampaign,
  listCampaigns,
  getCampaign,
  cancelCampaign,
  sendCampaign,
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  CampaignError,
} from "./bulk";
export type { Segment, SegmentRecipient, CampaignInput, TemplateInput } from "./bulk";

export { emailOverview, emailByCategory, listEmailLogs } from "./analytics";
export type { EmailOverview, EmailLogFilter } from "./analytics";

export { sweepScheduledCampaigns, sweepEmailReminders } from "./sweep";
export { handleResendEvent, verifyResendSignature } from "./tracking";

export { segmentSchema, campaignSchema, campaignUpdateSchema, templateSchema, templateUpdateSchema } from "./schema";

// — Client → customer stream --------------------------------------------------
export { dispatchToCustomer } from "./tenant-dispatch";
export type { CustomerDispatchParams, CustomerDispatchResult } from "./tenant-dispatch";
export { resolveClientBrand, resolveClientSender, sharedMailDomain } from "./tenant-sender";
export type { ClientBrand, ClientSender } from "./tenant-sender";
export { renderTenantLayout } from "./tenant-layout";
export {
  customerEmailConsent,
  setCustomerEmailConsent,
  customerUnsubPageUrl,
  customerUnsubOneClickUrl,
  customerUnsubToken,
  verifyCustomerUnsubToken,
  unsubscribeCustomerByToken,
} from "./customer-consent";
export * as customerTemplates from "./customer-templates";
export * as customerNotify from "./customer-notifications";

export {
  getSendingDomain,
  provisionSendingDomain,
  checkSendingDomain,
  sweepSendingDomains,
  removeSendingDomain,
  SendingDomainError,
} from "./sending-domains";
