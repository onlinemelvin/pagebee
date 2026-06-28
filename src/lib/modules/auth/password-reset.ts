import { prisma } from "@/lib/db";
import { updateAuthUserPassword } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/modules/audit";
import * as notify from "@/lib/modules/email/notifications";
import { appBase } from "@/lib/modules/email";
import { createAuthToken, consumeAuthToken } from "./tokens";

const RESET_TTL_MINUTES = 30;

export class AuthFlowError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

/**
 * Begin a PageBee-branded password reset. Always resolves successfully (even for
 * unknown addresses) so the endpoint can't be used to enumerate accounts — only
 * a real user receives an email.
 */
export async function requestPasswordReset(rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, status: true } });
  if (!user || user.status === "DISABLED") return;

  const token = await createAuthToken({ userId: user.id, email, type: "PASSWORD_RESET", ttlMinutes: RESET_TTL_MINUTES });
  const resetUrl = `${appBase()}/reset-password/${token}`;
  await notify.sendPasswordReset(email, { name: user.name, resetUrl, expiresMinutes: RESET_TTL_MINUTES, userId: user.id });
  await writeAudit({ action: "auth.password_reset_requested", entityType: "User", entityId: user.id });
}

/**
 * Complete a password reset: validate the single-use token, set the new password
 * in Supabase Auth, and send a confirmation email. Throws AuthFlowError on a bad
 * or expired token.
 */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  // The same page/endpoint serves genuine resets and first-time rep invites (different token types).
  // A type mismatch returns null without consuming, so trying both is safe.
  let consumed = await consumeAuthToken(token, "PASSWORD_RESET");
  let isInvite = false;
  if (!consumed) {
    consumed = await consumeAuthToken(token, "REP_INVITE");
    isInvite = Boolean(consumed);
  }
  if (!consumed) throw new AuthFlowError(400, "invalid_or_expired_token");

  const user = await prisma.user.findUnique({ where: { id: consumed.userId }, select: { id: true, name: true, email: true, supabaseUserId: true } });
  if (!user?.supabaseUserId) throw new AuthFlowError(400, "no_auth_identity");

  const res = await updateAuthUserPassword(user.supabaseUserId, newPassword);
  if (!res.ok) throw new AuthFlowError(502, res.error ?? "password_update_failed");

  await prisma.user.update({ where: { id: user.id }, data: { updatedAt: new Date() } });
  await writeAudit({ action: isInvite ? "auth.invite_accepted" : "auth.password_reset", entityType: "User", entityId: user.id });

  // First-time rep invites: the rep is *setting* their password, not changing an existing one — the
  // "your password was changed" security email would just confuse them, so skip it.
  if (!isInvite) await notify.sendPasswordChanged(user.email, { name: user.name, userId: user.id });
}
