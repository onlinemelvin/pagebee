import { z } from "zod";

/** Test signups (skip paid plan setup) are identified by an @test.com email. */
export function isTestEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith("@test.com");
}

export const registerSchema = z
  .object({
    businessName: z.string().trim().min(1, "Business name is required").max(120),
    businessType: z.string().trim().max(80).optional(),
    ownerName: z.string().trim().min(1, "Your name is required").max(120),
    email: z.string().trim().email("Enter a valid email").max(200),
    phone: z.string().trim().max(40).optional(),
    password: z.string().min(8, "Use at least 8 characters").max(200),
    plan: z.enum(["NECTAR", "HONEY", "HIVE"]).optional(),
    // Public preview claim: when present, signup adopts the provisional client behind this token
    // (the prospect's "Ready to launch" path) and the plan defaults to the preview's selected plan.
    previewToken: z.string().trim().min(1).max(120).optional(),
  })
  // Real (non-test) signups must choose a plan; test signups and preview claims may skip it.
  .refine((d) => isTestEmail(d.email) || Boolean(d.plan) || Boolean(d.previewToken), {
    message: "Please choose a plan",
    path: ["plan"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
