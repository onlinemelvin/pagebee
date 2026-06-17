import { z } from "zod";

export const leadInputSchema = z.object({
  type: z.enum(["CONTACT_FORM", "QUOTE_REQUEST", "SERVICE_INQUIRY"]).default("CONTACT_FORM"),
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Enter a valid email").max(200),
  phone: z.string().trim().min(1, "Phone is required").max(40),
  message: z.string().trim().max(2000).optional(),
  source: z.string().trim().max(200).optional(),
});

export type LeadInput = z.infer<typeof leadInputSchema>;

export const LEAD_STATUSES = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "BOOKED",
  "WON",
  "LOST",
  "SPAM",
] as const;

export const leadUpdateSchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  assignedToId: z.string().nullable().optional(),
});

export type LeadUpdateInput = z.infer<typeof leadUpdateSchema>;
