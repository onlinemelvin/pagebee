import { z } from "zod";

// Custom fields let any trade store what matters to them (vehicle + plate for auto repair, preferred
// stylist for a salon, gate code for a plumber) without bespoke columns. An ordered list of simple
// label/value pairs — easy to read and edit for non-technical owners.
export const customFieldSchema = z.object({
  label: z.string().trim().min(1, "Field name is required").max(60),
  value: z.string().trim().max(500),
});
export type CustomField = z.infer<typeof customFieldSchema>;

// Empty string → undefined so optional contact fields don't persist as "".
const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined));

export const customerInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z
    .string()
    .trim()
    .email("Enter a valid email")
    .max(200)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined)),
  phone: optionalTrimmed(50),
  company: optionalTrimmed(200),
  address: optionalTrimmed(500),
  note: optionalTrimmed(4000),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  customFields: z.array(customFieldSchema).max(40).optional(),
  source: optionalTrimmed(40),
});
export type CustomerInput = z.infer<typeof customerInputSchema>;

// Update = every field optional (partial patch). Reuses the same field rules.
export const customerUpdateSchema = customerInputSchema.partial();
export type CustomerUpdate = z.infer<typeof customerUpdateSchema>;

export const mergeInputSchema = z.object({
  // The record that survives; the other is merged into it and deleted.
  primaryId: z.string().min(1),
  duplicateId: z.string().min(1),
});
export type MergeInput = z.infer<typeof mergeInputSchema>;
