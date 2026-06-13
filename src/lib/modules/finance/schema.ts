import { z } from "zod";

export const DOC_TYPES = ["ESTIMATE", "QUOTE", "INVOICE"] as const;
export type DocType = (typeof DOC_TYPES)[number];

const discountKind = z.enum(["PERCENT", "FIXED"]);

/** One line on a document. unitAmount is cents; discountValue is bps (PERCENT) or cents (FIXED). */
export const lineItemSchema = z.object({
  serviceId: z.string().nullable().optional(),
  description: z.string().trim().min(1, "Describe the item").max(500),
  quantity: z.number().int().min(1).max(100_000).default(1),
  unitAmount: z.number().int().min(0).max(1_000_000_00),
  discountType: discountKind.nullable().optional(),
  discountValue: z.number().int().min(0).max(1_000_000_00).default(0),
  taxRateId: z.string().nullable().optional(),
});
export type LineItemInput = z.infer<typeof lineItemSchema>;

/** Create / replace a finance document (estimate, quote, or invoice). */
export const documentInputSchema = z.object({
  docType: z.enum(DOC_TYPES),
  customerId: z.string().nullable().optional(),
  // Inline customer when none is selected.
  customer: z
    .object({
      name: z.string().trim().min(1).max(200),
      email: z.string().trim().email().max(200).optional().or(z.literal("")),
      phone: z.string().trim().max(50).optional().or(z.literal("")),
    })
    .optional(),
  // Customer billing address — used for automatic (Stripe Tax) calculation; saved on the customer.
  customerAddress: z
    .object({
      line1: z.string().max(300).optional().or(z.literal("")),
      city: z.string().max(120).optional().or(z.literal("")),
      state: z.string().max(60).optional().or(z.literal("")),
      postalCode: z.string().max(20).optional().or(z.literal("")),
      country: z.string().max(2).optional().or(z.literal("")),
    })
    .optional(),
  currency: z.string().trim().min(3).max(8).default("usd"),
  lineItems: z.array(lineItemSchema).min(1, "Add at least one line"),
  discountType: discountKind.nullable().optional(),
  discountValue: z.number().int().min(0).max(1_000_000_00).default(0),
  depositAmount: z.number().int().min(0).max(1_000_000_00).default(0),
  notes: z.string().max(5000).nullable().optional(),
  terms: z.string().max(5000).nullable().optional(),
  issueDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
});
export type DocumentInput = z.infer<typeof documentInputSchema>;

export const taxRateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  rateBps: z.number().int().min(0).max(100_000), // up to 1000%
  inclusive: z.boolean().default(false),
  isDefault: z.boolean().default(false),
});
export type TaxRateInput = z.infer<typeof taxRateSchema>;

/** Stored in ClientSetting.financeSettings; all fields defaulted so a missing record is valid. */
export const financeSettingsSchema = z.object({
  currency: z.string().trim().min(3).max(8).default("usd"),
  numberPrefixes: z
    .object({
      ESTIMATE: z.string().trim().max(8).default("EST"),
      QUOTE: z.string().trim().max(8).default("QUO"),
      INVOICE: z.string().trim().max(8).default("INV"),
    })
    .default({ ESTIMATE: "EST", QUOTE: "QUO", INVOICE: "INV" }),
  defaultNotes: z.string().max(5000).default(""),
  defaultTerms: z.string().max(5000).default(""),
  defaultDueDays: z.number().int().min(0).max(365).default(14),
  estimateValidDays: z.number().int().min(1).max(365).default(30),
  // Phase 3 automation config — captured now, acted on later.
  reminders: z
    .object({
      enabled: z.boolean().default(false),
      beforeDueDays: z.array(z.number().int()).max(5).default([]),
      afterDueDays: z.array(z.number().int()).max(5).default([3, 7]),
    })
    .default({ enabled: false, beforeDueDays: [], afterDueDays: [3, 7] }),
  lateFee: z
    .object({
      enabled: z.boolean().default(false),
      type: discountKind.default("PERCENT"),
      value: z.number().int().min(0).default(0),
    })
    .default({ enabled: false, type: "PERCENT", value: 0 }),
  // Tax: manual rates (default) or automatic via Stripe Tax.
  taxMode: z.enum(["manual", "automatic"]).default("manual"),
  taxRegistrationStates: z.array(z.string().length(2)).max(60).default([]), // US states where they collect
  taxCode: z.string().max(40).default("txcd_99999999"), // Stripe product tax code (general default)

  // Money movement (wired in Phase 2).
  stripeMode: z.enum(["PLATFORM", "BYO"]).default("PLATFORM"),
  businessInfo: z
    .object({
      name: z.string().max(200).default(""),
      address: z.string().max(500).default(""),
      email: z.string().max(200).default(""),
      phone: z.string().max(50).default(""),
    })
    .default({ name: "", address: "", email: "", phone: "" }),
  // Structured details we collect on PageBee to PREFILL the PageBee Pay (Stripe Connect) onboarding,
  // so the client retypes as little as possible.
  payoutProfile: z
    .object({
      businessType: z.enum(["individual", "company"]).default("individual"),
      country: z.string().length(2).default("US"),
      legalName: z.string().max(200).default(""), // company legal name (company type)
      mcc: z.string().max(8).default(""), // Stripe merchant category code
      productDescription: z.string().max(500).default(""),
      firstName: z.string().max(100).default(""),
      lastName: z.string().max(100).default(""),
      dobDay: z.number().int().min(1).max(31).nullable().default(null),
      dobMonth: z.number().int().min(1).max(12).nullable().default(null),
      dobYear: z.number().int().min(1900).max(2100).nullable().default(null),
      addressLine1: z.string().max(300).default(""),
      addressLine2: z.string().max(300).default(""),
      city: z.string().max(120).default(""),
      state: z.string().max(120).default(""),
      postalCode: z.string().max(20).default(""),
    })
    .default({
      businessType: "individual",
      country: "US",
      legalName: "",
      mcc: "",
      productDescription: "",
      firstName: "",
      lastName: "",
      dobDay: null,
      dobMonth: null,
      dobYear: null,
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      postalCode: "",
    }),
});
export type FinanceSettings = z.infer<typeof financeSettingsSchema>;
export type PayoutProfile = FinanceSettings["payoutProfile"];

/** Record an offline/manual payment against an invoice (Phase 1 — Stripe payments come in Phase 2). */
export const manualPaymentSchema = z.object({
  amount: z.number().int().min(1).max(1_000_000_00),
  note: z.string().max(500).optional(),
});
export type ManualPaymentInput = z.infer<typeof manualPaymentSchema>;
