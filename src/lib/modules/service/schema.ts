import { z } from "zod";

/**
 * Curated icon keys (lucide-react names) a client can pick for a service. Stored as a plain
 * string on the backend; the UI maps the key to its lucide component.
 */
export const SERVICE_ICONS = [
  "sparkles",
  "wrench",
  "hammer",
  "scissors",
  "car",
  "home",
  "heart",
  "stethoscope",
  "paintbrush",
  "leaf",
  "camera",
  "dumbbell",
  "graduation-cap",
  "scale",
  "briefcase",
  "utensils",
  "dog",
  "baby",
  "shirt",
  "plug",
  "droplet",
  "flame",
  "shield",
  "star",
  "calendar",
  "clock",
  "phone",
  "package",
] as const;
export type ServiceIcon = (typeof SERVICE_ICONS)[number];

/** Upper bound on a service's typical time: 30 days in minutes (multi-day jobs are allowed). */
export const MAX_DURATION_MINUTES = 30 * 24 * 60;

/** Create payload for a service. icon/description are optional — the server AI-fills them from the name. */
export const serviceInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  icon: z.string().trim().max(40).nullable().optional(),
  durationMinutes: z.number().int().min(5).max(MAX_DURATION_MINUTES).default(60),
  price: z.number().int().min(0).max(10_000_00).nullable().optional(), // cents
  showOnWebsite: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});
export type ServiceInput = z.infer<typeof serviceInputSchema>;

/** Partial update payload — every field optional; omitted keys are left unchanged. */
export const serviceUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  icon: z.string().trim().max(40).nullable().optional(),
  durationMinutes: z.number().int().min(5).max(MAX_DURATION_MINUTES).optional(),
  price: z.number().int().min(0).max(10_000_00).nullable().optional(),
  showOnWebsite: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  active: z.boolean().optional(),
});
export type ServiceUpdate = z.infer<typeof serviceUpdateSchema>;
