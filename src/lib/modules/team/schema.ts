import { z } from "zod";

export const inviteInputSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(200),
  role: z.enum(["staff", "owner"]).default("staff"),
});
export type InviteInput = z.infer<typeof inviteInputSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().min(1).max(200),
  name: z.string().trim().max(120).optional(),
  password: z.string().min(8, "At least 8 characters").max(200).optional(),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
