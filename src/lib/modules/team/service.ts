import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { createAuthUser, findAuthUserId } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/modules/email";
import { writeAudit } from "@/lib/modules/audit";

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

function seatLimit(flags: Record<string, unknown>): number {
  return Number(flags.teamSeats ?? 1);
}

export interface TeamMember {
  userId: string;
  name: string | null;
  email: string;
  role: string;
  isYou: boolean;
  joinedAt: string;
}
export interface TeamInvite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
}
export interface TeamState {
  members: TeamMember[];
  invites: TeamInvite[];
  seatLimit: number;
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
      include: { user: { select: { id: true, name: true, email: true } } },
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
      isYou: m.userId === currentUserId,
      joinedAt: m.createdAt.toISOString(),
    })),
    invites: invites.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      expiresAt: i.expiresAt.toISOString(),
      createdAt: i.createdAt.toISOString(),
    })),
    seatLimit: seatLimit(flags),
    seatsUsed: members.length + invites.length,
  };
}

/** Invite someone to the team by email. Enforces the plan's seat limit. */
export async function inviteMember(clientId: string, actorUserId: string, emailRaw: string, role: "staff" | "owner") {
  const email = emailRaw.trim().toLowerCase();
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
    data: { clientId, email, role: role === "owner" ? "owner" : "staff", token, invitedBy: actorUserId, expiresAt },
  });

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { businessName: true } });
  const url = `${appBase()}/invite/${token}`;
  await sendEmail({
    to: email,
    subject: `You're invited to join ${client?.businessName ?? "a team"} on PageBee`,
    html: `<p>You've been invited to join <strong>${client?.businessName ?? "a business"}</strong> on PageBee.</p>
<p><a href="${url}" style="display:inline-block;background:#f59e0b;color:#1c1917;padding:10px 18px;border-radius:10px;font-weight:600;text-decoration:none">Accept invitation</a></p>
<p style="color:#78716c;font-size:13px">Or paste this link: ${url}<br/>This invitation expires in ${INVITE_DAYS} days.</p>`,
  });

  await writeAudit({ action: "team.invited", entityType: "Client", entityId: clientId, clientId, metadata: { email, role } });
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
    const already = await prisma.clientUser.findUnique({ where: { userId: targetUserId } });
    if (already) throw new TeamError(409, "already_on_a_team");
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
    prisma.clientUser.create({ data: { clientId: inv.clientId, userId: targetUserId, role: inv.role } }),
    prisma.clientUserInvite.update({ where: { id: inv.id }, data: { status: "accepted", acceptedAt: new Date() } }),
  ]);
  await writeAudit({ action: "team.joined", entityType: "Client", entityId: inv.clientId, clientId: inv.clientId, metadata: { email: inv.email } });
  return { clientId: inv.clientId, email: inv.email, createdAccount };
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
