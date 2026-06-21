import { z } from "zod";

// Capability keys (e.g. "finance:manage"); validated against the catalog in the service layer.
const permissionsField = z.array(z.string().max(40)).max(20).optional();

export const inviteInputSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(200),
  role: z.enum(["staff", "owner"]).default("staff"),
  permissions: permissionsField,
});
export type InviteInput = z.infer<typeof inviteInputSchema>;

export const updatePermissionsSchema = z.object({
  permissions: z.array(z.string().max(40)).max(20),
});
export type UpdatePermissionsInput = z.infer<typeof updatePermissionsSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().min(1).max(200),
  name: z.string().trim().max(120).optional(),
  password: z.string().min(8, "At least 8 characters").max(200).optional(),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
