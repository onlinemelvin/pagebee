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

// Minimum plausible time (ms) between the form appearing and a human submitting it. Real users take
// several seconds to type name/email/phone; anything faster is automation. Conservative to avoid ever
// blocking a real (even fast) person.
const MIN_FILL_MS = 1500;

/**
 * Cheap, no-friction bot signals carried alongside a lead submission by the platform lead-form script:
 *  - `company`: a honeypot field, hidden from real users; bots that fill every field populate it.
 *  - `_t`: ms elapsed between the form appearing and submit; an implausibly fast value is automation.
 * Both are best-effort: legacy/cached forms may send neither, so absence is never treated as a bot —
 * only a *positive* signal (honeypot filled, or measured-and-too-fast) flags the submission.
 */
export function looksLikeBotSubmission(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;

  const honeypot = b.company;
  if (typeof honeypot === "string" && honeypot.trim().length > 0) return true;

  const elapsed = Number(b._t);
  if (Number.isFinite(elapsed) && elapsed > 0 && elapsed < MIN_FILL_MS) return true;

  return false;
}

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
