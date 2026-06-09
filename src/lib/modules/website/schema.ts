import { z } from "zod";

/** Client-supplied intake (business name/type/contact come from the Client record). */
export const websiteIntakeSchema = z.object({
  about: z.string().trim().max(2000).optional(),
  services: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  serviceAreas: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  hours: z.string().trim().max(500).optional(),
  tone: z.string().trim().max(80).optional(),
});

export type WebsiteIntakeForm = z.infer<typeof websiteIntakeSchema>;
