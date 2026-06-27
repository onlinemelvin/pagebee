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
  // Primary call to action (Connect+ only; ignored on form-less plans).
  primaryGoal: z.string().trim().max(80).optional(),
  colorPalette: z.string().trim().max(160).optional(),
  pages: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  businessHours: z.array(businessHourSchema).max(7).optional(),
  logoUrl: z.string().url().max(600).optional(),
  imageUrls: z.array(z.string().url().max(600)).max(20).optional(),
  // Photos chosen specifically for the Gallery section/page (when selected).
  galleryImageUrls: z.array(z.string().url().max(600)).max(30).optional(),
  // Contact details the owner confirmed/edited for the Contact section (prefilled from registration).
  contact: z
    .object({
      email: z.string().trim().max(200).optional(),
      phone: z.string().trim().max(60).optional(),
      address: z.string().trim().max(300).optional(),
    })
    .optional(),
  // Pricing items for the Pricing page/section (prefilled from services, editable).
  pricing: z
    .array(z.object({ name: z.string().trim().min(1).max(160), price: z.string().trim().max(60).optional() }))
    .max(40)
    .optional(),
  // FAQ entries for the FAQ page/section (manual or AI-generated).
  faqs: z
    .array(z.object({ q: z.string().trim().min(1).max(300), a: z.string().trim().min(1).max(1500) }))
    .max(30)
    .optional(),
  // Team members for the Team page/section.
  team: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(160),
        role: z.string().trim().max(160).optional(),
        photoUrl: z.string().url().max(600).optional(),
      }),
    )
    .max(30)
    .optional(),
  customInstructions: z.string().trim().max(2000).optional(),
  // Free-text business details/policies for the AI knowledge base (grounds generated copy + chat).
  // Seeds AiKnowledgeBase at generation; the owner can expand it later in the knowledge-base editor.
  knowledgeDetails: z.string().trim().max(20000).optional(),
  // Set when regenerating for a requested preview revision — steers the new draft.
  revisionNote: z.string().trim().max(2000).optional(),
});

export type WebsiteIntakeForm = z.infer<typeof websiteIntakeSchema>;
export type BusinessHour = z.infer<typeof businessHourSchema>;
