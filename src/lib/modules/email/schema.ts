import { z } from "zod";

const CATEGORIES = ["WELCOME", "AUTH", "BILLING", "WEBSITE", "USAGE", "ACCOUNT", "TIPS", "ANNOUNCEMENT", "PROMOTION"] as const;
const MARKETING = ["TIPS", "ANNOUNCEMENT", "PROMOTION"] as const;

export const segmentSchema = z.object({
  plans: z.array(z.enum(["NECTAR", "HONEY", "HIVE"])).optional(),
  statuses: z.array(z.string().max(40)).optional(),
  includeTest: z.boolean().optional(),
});

export const campaignSchema = z.object({
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(200),
  bodyHtml: z.string().trim().min(1).max(50_000),
  // Bulk campaigns must be a marketing category (suppressible + unsubscribe footer).
  category: z.enum(MARKETING).default("ANNOUNCEMENT"),
  segment: segmentSchema,
  scheduledAt: z.string().datetime().optional().nullable(),
});

export const campaignUpdateSchema = campaignSchema.partial();

export const templateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(200),
  bodyHtml: z.string().trim().min(1).max(50_000),
  category: z.enum(CATEGORIES).default("ANNOUNCEMENT"),
});

export const templateUpdateSchema = templateSchema.partial();

export type CampaignBody = z.infer<typeof campaignSchema>;
export type TemplateBody = z.infer<typeof templateSchema>;
