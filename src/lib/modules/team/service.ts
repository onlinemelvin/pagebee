import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { createAuthUser, findAuthUserId } from "@/lib/supabase/admin";
import { dispatch, escapeHtml } from "@/lib/modules/email";
import { button, linkFallback } from "@/lib/modules/email/layout";
import { writeAudit } from "@/lib/modules/audit";
import { sanitizePermissions } from "./permissions";

const INVITE_DAYS = 14;

export class TeamError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

function appBase(): string {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const proto = root.includes("localhost") ? "http" : "https";
  return `${proto}://${root}`;
}

async function planFlags(clientId: string): Promise<Record<string, unknown>> {
  const sub = await prisma.subscription.findUnique({
    where: { clientId },
    select: { plan: { select: { featureFlags: true } } },
  });
  return (sub?.plan.featureFlags ?? {}) as Record<string, unknown>;
}

function seatsUnlimited(flags: Record<string, unknown>): boolean {
  return flags.unlimitedSeats === true;
}

function seatLimit(flags: Record<string, unknown>): number {
  if (seatsUnlimited(flags)) return Infinity;
  return Number(flags.teamSeats ?? 1);
}

export interface TeamMember {
  userId: string;
  name: string | null;
  email: string;
  role: string;
  permissions: string[];
  isYou: boolean;
  disabled: boolean; // access switched off (User.status = DISABLED) — can't sign in until re-enabled
  joinedAt: string;
}
export interface TeamInvite {
  id: string;
  email: string;
  role: string;
  permissions: string[];
  expiresAt: string;
  createdAt: string;
}
export interface TeamState {
  members: TeamMember[];
  invites: TeamInvite[];
  seatLimit: number; // not meaningful when seatsUnlimited is true
  seatsUnlimited: boolean;
  seatsUsed: number;
}

/** True when the user is the team owner of the client. */
export async function isOwner(clientId: string, userId: string): Promise<boolean> {
  const m = await prisma.clientUser.findFirst({ where: { clientId, userId }, select: { role: true } });
  return m?.role === "owner";
}

/** Throws 403 unless the user is the team owner — gates invite/revoke/remove. */
export async function assertOwner(clientId: string, userId: string): Promise<void> {
  if (!(await isOwner(clientId, userId))) throw new TeamError(403, "owner_only");
}

/** Members + pending invites + seat usage for a client's team. */
export async function listTeam(clientId: string, currentUserId: string): Promise<TeamState> {
  const now = new Date();
  const [members, invites, flags] = await Promise.all([
    prisma.clientUser.findMany({
      where: { clientId },
      include: { user: { select: { id: true, name: true, email: true, status: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.clientUserInvite.findMany({
      where: { clientId, status: "pending", expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
    }),
    planFlags(clientId),
  ]);
  return {
    members: members.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      permissions: m.permissions,
      isYou: m.userId === currentUserId,
      disabled: m.user.status === "DISABLED",
      joinedAt: m.createdAt.toISOString(),
    })),
    invites: invites.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      permissions: i.permissions,
      expiresAt: i.expiresAt.toISOString(),
      createdAt: i.createdAt.toISOString(),
    })),
    seatLimit: seatsUnlimited(flags) ? members.length + invites.length : seatLimit(flags),
    seatsUnlimited: seatsUnlimited(flags),
    seatsUsed: members.length + invites.length,
  };
}

/** Pre-flight check for the invite form (step 1): is this email free to invite, already a PageBee
 *  team member, or already holding a pending invite for this client? Mirrors the guards in
 *  inviteMember so the owner learns the outcome before picking access. */
export async function checkInviteEmail(
  clientId: string,
  emailRaw: string,
): Promise<{ status: "ok" | "already_on_a_team" | "already_invited" }> {
  const email = emailRaw.trim().toLowerCase();
  const [existingUser, dup] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { clientUser: { select: { clientId: true } } } }),
    prisma.clientUserInvite.findFirst({ where: { clientId, email, status: "pending" } }),
  ]);
  if (existingUser?.clientUser) return { status: "already_on_a_team" };
  if (dup) return { status: "already_invited" };
  return { status: "ok" };
}

/** Invite someone to the team by email. Enforces the plan's seat limit. */
export async function inviteMember(
  clientId: string,
  actorUserId: string,
  emailRaw: string,
  role: "staff" | "owner",
  permissions: string[] = [],
) {
  const email = emailRaw.trim().toLowerCase();
  // Owners hold every capability implicitly; only staff carry an explicit permission set.
  const perms = role === "owner" ? [] : sanitizePermissions(permissions);
  const flags = await planFlags(clientId);
  const limit = seatLimit(flags);
  if (limit <= 1) throw new TeamError(403, "team_not_available");

  const now = new Date();
  const [memberCount, inviteCount] = await Promise.all([
    prisma.clientUser.count({ where: { clientId } }),
    prisma.clientUserInvite.count({ where: { clientId, status: "pending", expiresAt: { gt: now } } }),
  ]);
  if (memberCount + inviteCount >= limit) throw new TeamError(409, "seat_limit_reached");

  // Already on a team? (a user belongs to exactly one client)
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { clientUser: { select: { clientId: true } } },
  });
  if (existingUser?.clientUser) throw new TeamError(409, "already_on_a_team");

  const dup = await prisma.clientUserInvite.findFirst({ where: { clientId, email, status: "pending" } });
  if (dup) throw new TeamError(409, "already_invited");

  const token = `inv_${crypto.randomBytes(24).toString("base64url")}`;
  const expiresAt = new Date(now.getTime() + INVITE_DAYS * 86_400_000);
  const invite = await prisma.clientUserInvite.create({
    data: { clientId, email, role: role === "owner" ? "owner" : "staff", permissions: perms, token, invitedBy: actorUserId, expiresAt },
  });

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { businessName: true } });
  const business = client?.businessName ?? "a business";
  const base = appBase();
  const url = `${base}/invite/${token}`;
  // One-click opt-out (RFC 8058): declines the invite so we stop emailing. Doubles as a footer
  // "don't want this?" link and a List-Unsubscribe header — a real opt-out target helps deliverability.
  const declineUrl = `${base}/api/v1/public/invite/decline?token=${token}`;
  // Route through the branded transactional funnel (dispatch) — gives us the PageBee layout, a
  // reply-to, an EmailLog record, and better inbox placement than a bare one-button email.
  const res = await dispatch({
    to: email,
    subject: `You're invited to join ${business} on PageBee`,
    category: "ACCOUNT",
    template: "team_invite",
    clientId,
    preheader: `Accept your invitation to ${business} on PageBee.`,
    listUnsubscribeUrl: declineUrl,
    body: `<p style="margin:0 0 14px">Hi there,</p>
<p style="margin:0 0 14px">You've been invited to join <strong>${escapeHtml(business)}</strong> on PageBee — the platform they use to run their website, leads, bookings and more.</p>
<p style="margin:0 0 4px">Click below to accept and set up your account:</p>
${button("Accept invitation", url)}
${linkFallback(url)}
<p style="margin:14px 0 0;color:#78716c;font-size:13px">This invitation expires in ${INVITE_DAYS} days. Not expecting it, or don't want to join? <a href="${declineUrl}" style="color:#78716c">Decline this invitation</a> and we won't email you again.</p>`,
  });

  // If the email never went out, don't leave an orphaned pending invite the owner thinks was sent.
  if (res.status === "FAILED") {
    await prisma.clientUserInvite.delete({ where: { id: invite.id } }).catch(() => {});
    throw new TeamError(502, "email_failed");
  }

  await writeAudit({ action: "team.invited", entityType: "Client", entityId: clientId, clientId, metadata: { email, role, permissions: perms } });
  return invite;
}

/** Public lookup of a pending invite by token (for the accept page). */
export async function getInvite(token: string) {
  const inv = await prisma.clientUserInvite.findUnique({
    where: { token },
    include: { client: { select: { businessName: true } } },
  });
  if (!inv || inv.status !== "pending" || inv.expiresAt < new Date()) return null;
  return { email: inv.email, role: inv.role, businessName: inv.client.businessName, clientId: inv.clientId };
}

/**
 * Accept an invite. If `userId` is provided (already signed in) the existing user joins.
 * Otherwise an account is created from `name` + `password` for the invite's email.
 */
export async function acceptInvite(
  token: string,
  opts: { userId?: string; name?: string; password?: string },
): Promise<{ clientId: string; email: string; createdAccount: boolean }> {
  const inv = await prisma.clientUserInvite.findUnique({ where: { token } });
  if (!inv || inv.status !== "pending" || inv.expiresAt < new Date()) throw new TeamError(404, "invite_invalid");

  const flags = await planFlags(inv.clientId);
  const used = await prisma.clientUser.count({ where: { clientId: inv.clientId } });
  if (used >= seatLimit(flags)) throw new TeamError(409, "seat_limit_reached");

  let targetUserId = opts.userId;
  let createdAccount = false;

  if (targetUserId) {
    // Signed-in accept: the invite is bound to a specific email, so the current session must BE that
    // person — never silently attach whoever happens to be logged in (e.g. the owner who sent it).
    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { email: true, clientUser: { select: { id: true } } },
    });
    if (!user) throw new TeamError(404, "invite_invalid");
    if (user.email.toLowerCase() !== inv.email.toLowerCase()) throw new TeamError(409, "email_mismatch");
    if (user.clientUser) throw new TeamError(409, "already_on_a_team");
  } else {
    if (!opts.password || opts.password.length < 8) throw new TeamError(400, "password_required");
    const created = await createAuthUser(inv.email, opts.password);
    let supabaseUserId: string | undefined;
    if (created.ok) supabaseUserId = created.id;
    else if (created.status === 422 || created.status === 409) supabaseUserId = await findAuthUserId(inv.email);
    else throw new TeamError(502, created.error);

    const existing = await prisma.user.findUnique({
      where: { email: inv.email },
      select: { id: true, clientUser: { select: { id: true } } },
    });
    if (existing) {
      if (existing.clientUser) throw new TeamError(409, "already_on_a_team");
      targetUserId = existing.id;
    } else {
      const u = await prisma.user.create({
        data: { email: inv.email, name: opts.name?.trim() || inv.email, type: "CLIENT", status: "ACTIVE", supabaseUserId },
      });
      targetUserId = u.id;
      createdAccount = true;
    }
  }

  await prisma.$transaction([
    prisma.clientUser.create({
      data: {
        clientId: inv.clientId,
        userId: targetUserId,
        role: inv.role,
        permissions: inv.role === "owner" ? [] : sanitizePermissions(inv.permissions),
      },
    }),
    prisma.clientUserInvite.update({ where: { id: inv.id }, data: { status: "accepted", acceptedAt: new Date() } }),
  ]);
  await writeAudit({ action: "team.joined", entityType: "Client", entityId: inv.clientId, clientId: inv.clientId, metadata: { email: inv.email } });
  return { clientId: inv.clientId, email: inv.email, createdAccount };
}

/**
 * Decline a pending invite from the email's one-click opt-out (no session). Idempotent and
 * intentionally quiet: an unknown/already-resolved token is treated as success so the public
 * endpoint never leaks whether a token exists. Accepted invites are left untouched.
 */
export async function declineInviteByToken(token: string): Promise<void> {
  const inv = await prisma.clientUserInvite.findUnique({ where: { token }, select: { id: true, clientId: true, status: true } });
  if (!inv || inv.status !== "pending") return;
  await prisma.clientUserInvite.update({ where: { id: inv.id }, data: { status: "declined" } });
  await writeAudit({ action: "team.invite_declined", entityType: "Client", entityId: inv.clientId, clientId: inv.clientId });
}

/** Revoke a pending invite (scoped to the client). */
export async function revokeInvite(clientId: string, inviteId: string) {
  const inv = await prisma.clientUserInvite.findFirst({ where: { id: inviteId, clientId } });
  if (!inv) throw new TeamError(404, "not_found");
  await prisma.clientUserInvite.update({ where: { id: inviteId }, data: { status: "revoked" } });
  await writeAudit({ action: "team.invite_revoked", entityType: "Client", entityId: clientId, clientId });
  return { id: inviteId };
}

/** Remove a team member. The owner can't be removed and you can't remove yourself here. */
export async function removeMember(clientId: string, actorUserId: string, memberUserId: string) {
  if (memberUserId === actorUserId) throw new TeamError(400, "cannot_remove_self");
  const member = await prisma.clientUser.findFirst({ where: { clientId, userId: memberUserId } });
  if (!member) throw new TeamError(404, "not_found");
  if (member.role === "owner") throw new TeamError(403, "cannot_remove_owner");
  await prisma.clientUser.delete({ where: { id: member.id } });
  await writeAudit({ action: "team.member_removed", entityType: "Client", entityId: clientId, clientId, metadata: { memberUserId } });
  return { userId: memberUserId };
}

/**
 * Disable (or re-enable) a team member's account. Disabling flips their User.status to DISABLED,
 * which makes getAuthContext() return null for them — they're fully locked out (can't sign in or
 * hit any API) until re-enabled, but their membership, permissions and history are preserved.
 * Owner-only (route-enforced); you can't disable the owner or yourself.
 */
export async function setMemberDisabled(clientId: string, actorUserId: string, memberUserId: string, disabled: boolean) {
  if (memberUserId === actorUserId) throw new TeamError(400, "cannot_disable_self");
  const member = await prisma.clientUser.findFirst({ where: { clientId, userId: memberUserId }, select: { role: true } });
  if (!member) throw new TeamError(404, "not_found");
  if (member.role === "owner") throw new TeamError(403, "cannot_disable_owner");
  await prisma.user.update({ where: { id: memberUserId }, data: { status: disabled ? "DISABLED" : "ACTIVE" } });
  await writeAudit({ action: disabled ? "team.member_disabled" : "team.member_enabled", entityType: "Client", entityId: clientId, clientId, metadata: { memberUserId } });
  return { userId: memberUserId, disabled };
}

/** Replace a staff member's capability set. Owner-only (enforced by the route); the owner's own
 *  permissions can't be edited (they implicitly hold everything). */
export async function updateMemberPermissions(clientId: string, memberUserId: string, permissions: string[]) {
  const member = await prisma.clientUser.findFirst({ where: { clientId, userId: memberUserId } });
  if (!member) throw new TeamError(404, "not_found");
  if (member.role === "owner") throw new TeamError(400, "cannot_edit_owner");
  const perms = sanitizePermissions(permissions);
  await prisma.clientUser.update({ where: { id: member.id }, data: { permissions: perms } });
  await writeAudit({ action: "team.permissions_updated", entityType: "Client", entityId: clientId, clientId, metadata: { memberUserId, permissions: perms } });
  return { userId: memberUserId, permissions: perms };
}
