import { z } from "zod";

/** Friendly merchant-category options mapped to Stripe MCC codes. */
export const MCC_OPTIONS: { code: string; label: string }[] = [
  { code: "7349", label: "Cleaning & maintenance" },
  { code: "7542", label: "Car wash" },
  { code: "7538", label: "Auto repair & service" },
  { code: "1711", label: "Plumbing, heating & AC" },
  { code: "1520", label: "General contractor / construction" },
  { code: "7230", label: "Beauty & barber" },
  { code: "7298", label: "Spa & wellness" },
  { code: "5812", label: "Restaurant & dining" },
  { code: "5499", label: "Food & convenience store" },
  { code: "8011", label: "Medical / doctor" },
  { code: "8021", label: "Dental" },
  { code: "8099", label: "Health services" },
  { code: "7392", label: "Consulting & professional services" },
  { code: "5734", label: "Computer software / IT" },
  { code: "7333", label: "Photography & video" },
  { code: "7991", label: "Fitness & recreation" },
  { code: "7299", label: "Other personal services" },
  { code: "8999", label: "Other professional services" },
];

const emptyable = (s: z.ZodString) => s.optional().or(z.literal(""));

/**
 * Full onboarding submission for a Stripe Custom account, collected on PageBee's own UI.
 * Sensitive values (SSN, EIN, bank) are forwarded to Stripe and never stored by PageBee.
 */
export const onboardingSubmitSchema = z.object({
  businessType: z.enum(["individual", "company"]),
  country: z.string().length(2).default("US"),

  // Representative / individual
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().min(7).max(30),
  dobDay: z.number().int().min(1).max(31),
  dobMonth: z.number().int().min(1).max(12),
  dobYear: z.number().int().min(1900).max(2100),
  ssnLast4: z.string().regex(/^\d{4}$/, "Enter the last 4 of the SSN"),
  idNumber: z.string().regex(/^\d{9}$/).optional(), // full SSN, optional unless Stripe requires it

  addressLine1: z.string().trim().min(1).max(300),
  addressLine2: emptyable(z.string().max(300)),
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().min(2).max(60),
  postalCode: z.string().trim().min(3).max(20),

  // Business
  businessName: emptyable(z.string().max(200)),
  mcc: z.string().min(4).max(8),
  productDescription: z.string().trim().min(5).max(500),
  taxId: z.string().regex(/^\d{9}$/).optional(), // company EIN

  // Bank (tokenized client-side via Stripe.js — only the token reaches us)
  bankToken: z.string().trim().min(5),
  accountHolderName: z.string().trim().min(1).max(200),

  // Terms
  tosAccepted: z.literal(true),
});
export type OnboardingSubmit = z.infer<typeof onboardingSubmitSchema>;
