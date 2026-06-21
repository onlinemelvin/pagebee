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
