import { z } from "zod";

/** Prospect lifecycle stages (string column on Prospect, kept in sync with the funnel). */
export const PROSPECT_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "preview_sent",
  "quoted",
  "closed",
  "lost",
] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined));

export const prospectInputSchema = z.object({
  businessName: z.string().trim().min(1, "Business name is required").max(200),
  contactName: optionalTrimmed(120),
  email: z
    .string()
    .trim()
    .email("Enter a valid email")
    .max(200)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined)),
  phone: optionalTrimmed(40),
  businessType: optionalTrimmed(120),
  source: optionalTrimmed(60),
  notes: optionalTrimmed(4000),
});
export type ProspectInput = z.infer<typeof prospectInputSchema>;

export const prospectUpdateSchema = prospectInputSchema.partial().extend({
  status: z.enum(PROSPECT_STATUSES).optional(),
});
export type ProspectUpdate = z.infer<typeof prospectUpdateSchema>;

export const activityInputSchema = z.object({
  type: z.enum(["call", "email", "meeting", "note"]),
  summary: z.string().trim().min(1, "Summary is required").max(2000),
});
export type ActivityInput = z.infer<typeof activityInputSchema>;

export const callNoteInputSchema = z.object({
  outcome: z.enum(["no_answer", "interested", "callback", "not_interested"]).optional(),
  note: z.string().trim().min(1, "Note is required").max(2000),
});
export type CallNoteInput = z.infer<typeof callNoteInputSchema>;

export const followUpInputSchema = z.object({
  dueAt: z.coerce.date(),
  note: optionalTrimmed(500),
});
export type FollowUpInput = z.infer<typeof followUpInputSchema>;

/** Admin provisions a commission rep: creates the auth identity, User+Employee, and a SENT contract. */
export const provisionRepInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Enter a valid email").max(200),
  title: optionalTrimmed(120),
});
export type ProvisionRepInput = z.infer<typeof provisionRepInputSchema>;

/** A rep e-signs their commission agreement. */
export const signContractInputSchema = z.object({
  fullName: z.string().trim().min(2, "Type your full legal name to sign").max(160),
  agree: z.literal(true, { message: "You must accept the agreement" }),
});
export type SignContractInput = z.infer<typeof signContractInputSchema>;

/** A rep drafts a quote for a prospect. Fees are integer cents. */
export const quoteInputSchema = z.object({
  prospectId: z.string().min(1),
  plan: z.enum(["NECTAR", "HONEY", "HIVE"]),
  offeredSetupFee: z.number().int().min(0).max(10_000_00),
  offeredMonthlyFee: z.number().int().min(0).max(10_000_00),
  contractLengthMonths: z.number().int().min(0).max(60).optional(),
  discountReason: optionalTrimmed(300),
  customerNotes: optionalTrimmed(2000),
  internalNotes: optionalTrimmed(2000),
});
export type QuoteInput = z.infer<typeof quoteInputSchema>;

/** Admin decides a quote approval. */
export const approvalDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  comment: optionalTrimmed(1000),
});
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;

/** Admin adds a rep enablement resource (training doc / video / script). */
export const resourceInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  url: z.string().trim().url("Enter a valid URL").max(2000),
  group: z.string().trim().min(1, "Group is required").max(80),
});
export type ResourceInput = z.infer<typeof resourceInputSchema>;
