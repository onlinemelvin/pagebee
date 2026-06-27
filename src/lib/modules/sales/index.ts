// Public surface of the sales module (internal ops — PageBee's own sales reps).
// Other modules + API routes import from here only. See docs/SALES_REP_PROGRAM.md.
export { SalesError } from "./errors";
export { normalizeDedupeKey } from "./dedupe";
export {
  computeCommission,
  DEFAULT_COMMISSION_BASES,
  FREE_DISCOUNT_ALLOWANCE_CENTS,
  MIN_BASE_FRACTION,
} from "./commission";
export type { CommissionBases, CommissionResult } from "./commission";
export {
  createProspect,
  listProspects,
  getProspect,
  updateProspect,
  logActivity,
  addCallNote,
  scheduleFollowUp,
  listFollowUps,
  completeFollowUp,
} from "./prospects";
export { repFunnelStats } from "./dashboard";
export type { RepFunnelStats } from "./dashboard";
export { getRepWorkspace } from "./workspace";
export type { RepWorkspace } from "./workspace";
export { getCommissionTerms, renderCommissionTerms, getRepContract, signContract } from "./contracts";
export type { CommissionTerms } from "./contracts";
export { provisionRep, listReps, certifyRep, deleteRep } from "./reps";
export type { RepSummary } from "./reps";
export { evaluateGuardrails, REP_SETUP_FLOOR_CENTS } from "./guardrails";
export type { GuardrailInput, GuardrailResult } from "./guardrails";
export {
  createQuote,
  listQuotes,
  getQuote,
  sendQuote,
  listPendingApprovals,
  decideQuoteApproval,
} from "./quotes";
export {
  ensureActiveCommissionPlan,
  accrueCommissionForClient,
  runCommissionAccrualSweep,
  runCommissionEligibilitySweep,
  clawbackClientCommissions,
} from "./accrual";
export { convertQuoteToClient } from "./conversion";
export {
  listSettlementQueue,
  approveCommission,
  markCommissionsPaid,
  repCommissionStatement,
} from "./settlement";
export type { SettlementRow, RepSettlement } from "./settlement";
export { repPerformance, discountImpact } from "./analytics";
export type { RepPerformance, DiscountImpact } from "./analytics";
export { listRepResources, createRepResource, deleteRepResource } from "./resources";
export type { ResourceItem, ResourceGroup } from "./resources";
export { sweepFollowUpReminders } from "./reminders";
export {
  prospectInputSchema,
  prospectUpdateSchema,
  activityInputSchema,
  callNoteInputSchema,
  followUpInputSchema,
  provisionRepInputSchema,
  signContractInputSchema,
  quoteInputSchema,
  approvalDecisionSchema,
  resourceInputSchema,
  PROSPECT_STATUSES,
} from "./schema";
export type {
  ProspectInput,
  ProspectUpdate,
  ProspectStatus,
  ActivityInput,
  CallNoteInput,
  FollowUpInput,
  ProvisionRepInput,
  SignContractInput,
  QuoteInput,
  ApprovalDecision,
} from "./schema";
