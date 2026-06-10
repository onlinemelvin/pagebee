import { z } from "zod";

export const businessHourSchema = z.object({
  day: z.string().max(12),
  closed: z.boolean().optional(),
  open: z.string().max(10).optional(),
  close: z.string().max(10).optional(),
});

/** Client-supplied intake. About + services are required; the rest is optional. */
export const websiteIntakeSchema = z.object({
  about: z.string().trim().min(1, "Tell us a bit about your business").max(2000),
  services: z.array(z.string().trim().min(1).max(120)).min(1, "Add at least one service").max(30),
  serviceAreas: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  tone: z.string().trim().max(80).optional(),
  colorPalette: z.string().trim().max(160).optional(),
  pages: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  businessHours: z.array(businessHourSchema).max(7).optional(),
  logoUrl: z.string().url().max(600).optional(),
  imageUrls: z.array(z.string().url().max(600)).max(20).optional(),
  // Set when regenerating for a requested preview revision — steers the new draft.
  revisionNote: z.string().trim().max(2000).optional(),
});

export type WebsiteIntakeForm = z.infer<typeof websiteIntakeSchema>;
export type BusinessHour = z.infer<typeof businessHourSchema>;
