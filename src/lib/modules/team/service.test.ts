import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAuthUser: vi.fn(), findAuthUserId: vi.fn() }));
vi.mock("@/lib/modules/email", () => ({
  dispatch: vi.fn(),
  escapeHtml: (s: string) => s,
}));
vi.mock("@/lib/modules/email/layout", () => ({
  button: (text: string, url: string) => `<a href="${url}">${text}</a>`,
  linkFallback: (url: string) => url,
}));

import {
  isOwner,
  assertOwner,
  listTeam,
  checkInviteEmail,
  inviteMember,
  getInvite,
  acceptInvite,
  declineInviteByToken,
  revokeInvite,
  removeMember,
  setMemberDisabled,
  updateMemberPermissions,
  TeamError,
} from "./service";
import { writeAudit } from "@/lib/modules/audit";
import { dispatch } from "@/lib/modules/email";
import { createAuthUser } from "@/lib/supabase/admin";

beforeEach(() => {
  vi.clearAllMocks();
});

// ── isOwner / assertOwner ──────────────────────────────────────────────────────

describe("isOwner", () => {
  it("returns true when the clientUser record has role owner", async () => {
    prismaMock.clientUser.findFirst.mockResolvedValue({ role: "owner" });
    expect(await isOwner("c1", "u1")).toBe(true);
  });

  it("returns false when the record has role staff", async () => {
    prismaMock.clientUser.findFirst.mockResolvedValue({ role: "staff" });
    expect(await isOwner("c1", "u1")).toBe(false);
  });

  it("returns false when no record is found", async () => {
    prismaMock.clientUser.findFirst.mockResolvedValue(null);
    expect(await isOwner("c1", "u1")).toBe(false);
  });
});

describe("assertOwner", () => {
  it("resolves without throwing when user is owner", async () => {
    prismaMock.clientUser.findFirst.mockResolvedValue({ role: "owner" });
    await expect(assertOwner("c1", "u1")).resolves.toBeUndefined();
  });

  it("throws TeamError(403, owner_only) when user is not owner", async () => {
    prismaMock.clientUser.findFirst.mockResolvedValue({ role: "staff" });
    await expect(assertOwner("c1", "u1")).rejects.toMatchObject({ status: 403, code: "owner_only" });
  });
});

// ── listTeam ──────────────────────────────────────────────────────────────────

describe("listTeam", () => {
  it("returns members, invites, seat info", async () => {
    prismaMock.clientUser.findMany.mockResolvedValue([
      {
        userId: "u1",
        role: "owner",
        permissions: [],
        createdAt: new Date("2024-01-01"),
        user: { id: "u1", name: "Alice", email: "alice@x.com", status: "ACTIVE" },
      },
    ] as never);
    prismaMock.clientUserInvite.findMany.mockResolvedValue([]);
    prismaMock.subscription.findUnique.mockResolvedValue({ plan: { featureFlags: { teamSeats: 5 } } });

    const state = await listTeam("c1", "u1");

    expect(state.members).toHaveLength(1);
    expect(state.members[0].isYou).toBe(true);
    expect(state.invites).toHaveLength(0);
    expect(state.seatsUsed).toBe(1);
  });

  it("marks disabled when user status is DISABLED", async () => {
    prismaMock.clientUser.findMany.mockResolvedValue([
      {
        userId: "u2",
        role: "staff",
        permissions: [],
        createdAt: new Date(),
        user: { id: "u2", name: "Bob", email: "bob@x.com", status: "DISABLED" },
      },
    ] as never);
    prismaMock.clientUserInvite.findMany.mockResolvedValue([]);
    prismaMock.subscription.findUnique.mockResolvedValue({ plan: { featureFlags: {} } });

    const state = await listTeam("c1", "u1");
    expect(state.members[0].disabled).toBe(true);
  });
});

// ── checkInviteEmail ───────────────────────────────────────────────────────────

describe("checkInviteEmail", () => {
  it("returns ok when address is free", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.clientUserInvite.findFirst.mockResolvedValue(null);
    expect(await checkInviteEmail("c1", "new@x.com")).toEqual({ status: "ok" });
  });

  it("returns already_on_a_team when the user has a clientUser record", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ clientUser: { clientId: "c2" } });
    prismaMock.clientUserInvite.findFirst.mockResolvedValue(null);
    expect(await checkInviteEmail("c1", "taken@x.com")).toEqual({ status: "already_on_a_team" });
  });

  it("returns already_invited when a pending invite exists", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.clientUserInvite.findFirst.mockResolvedValue({ id: "i1" });
    expect(await checkInviteEmail("c1", "pending@x.com")).toEqual({ status: "already_invited" });
  });

  it("normalises the email to lowercase", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.clientUserInvite.findFirst.mockResolvedValue(null);
    await checkInviteEmail("c1", "CAPS@EXAMPLE.COM");
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "caps@example.com" } }),
    );
  });
});

// ── inviteMember ──────────────────────────────────────────────────────────────

describe("inviteMember", () => {
  function stubAvailablePlan() {
    prismaMock.subscription.findUnique.mockResolvedValue({ plan: { featureFlags: { teamSeats: 5 } } });
    prismaMock.clientUser.count.mockResolvedValue(1);
    prismaMock.clientUserInvite.count.mockResolvedValue(0);
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.clientUserInvite.findFirst.mockResolvedValue(null);
    prismaMock.clientUserInvite.create.mockResolvedValue({ id: "i1", token: "inv_tok" });
    prismaMock.client.findUnique.mockResolvedValue({ businessName: "Acme" });
    vi.mocked(dispatch).mockResolvedValue({ status: "SENT" } as never);
  }

  it("throws 403 team_not_available when seat limit is 1", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ plan: { featureFlags: { teamSeats: 1 } } });
    await expect(inviteMember("c1", "u1", "new@x.com", "staff")).rejects.toMatchObject({
      status: 403,
      code: "team_not_available",
    });
  });

  it("throws 409 seat_limit_reached when all seats are used", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ plan: { featureFlags: { teamSeats: 3 } } });
    prismaMock.clientUser.count.mockResolvedValue(2);
    prismaMock.clientUserInvite.count.mockResolvedValue(1); // 2+1 >= 3
    await expect(inviteMember("c1", "u1", "new@x.com", "staff")).rejects.toMatchObject({
      status: 409,
      code: "seat_limit_reached",
    });
  });

  it("throws 409 already_on_a_team when the invitee already belongs to a team", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ plan: { featureFlags: { teamSeats: 5 } } });
    prismaMock.clientUser.count.mockResolvedValue(1);
    prismaMock.clientUserInvite.count.mockResolvedValue(0);
    prismaMock.user.findUnique.mockResolvedValue({ clientUser: { clientId: "c9" } });
    await expect(inviteMember("c1", "u1", "taken@x.com", "staff")).rejects.toMatchObject({
      status: 409,
      code: "already_on_a_team",
    });
  });

  it("throws 409 already_invited when a pending invite exists", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ plan: { featureFlags: { teamSeats: 5 } } });
    prismaMock.clientUser.count.mockResolvedValue(1);
    prismaMock.clientUserInvite.count.mockResolvedValue(0);
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.clientUserInvite.findFirst.mockResolvedValue({ id: "i_old" });
    await expect(inviteMember("c1", "u1", "dup@x.com", "staff")).rejects.toMatchObject({
      status: 409,
      code: "already_invited",
    });
  });

  it("creates the invite, sends email, and audits on success", async () => {
    stubAvailablePlan();
    await inviteMember("c1", "u1", "new@x.com", "staff", ["inquiries:view"]);

    expect(prismaMock.clientUserInvite.create).toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalled();
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "team.invited" }));
  });

  it("throws 502 email_failed and deletes the orphaned invite when the email fails", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ plan: { featureFlags: { teamSeats: 5 } } });
    prismaMock.clientUser.count.mockResolvedValue(1);
    prismaMock.clientUserInvite.count.mockResolvedValue(0);
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.clientUserInvite.findFirst.mockResolvedValue(null);
    prismaMock.clientUserInvite.create.mockResolvedValue({ id: "i1", token: "inv_tok" });
    prismaMock.client.findUnique.mockResolvedValue({ businessName: "Acme" });
    prismaMock.clientUserInvite.delete.mockResolvedValue({});
    vi.mocked(dispatch).mockResolvedValue({ status: "FAILED" } as never);

    await expect(inviteMember("c1", "u1", "new@x.com", "staff")).rejects.toMatchObject({
      status: 502,
      code: "email_failed",
    });
    expect(prismaMock.clientUserInvite.delete).toHaveBeenCalledWith({ where: { id: "i1" } });
  });

  it("owners get empty permissions array regardless of supplied permissions", async () => {
    stubAvailablePlan();
    await inviteMember("c1", "u1", "owner@x.com", "owner", ["finance:manage"]);

    const createArg = prismaMock.clientUserInvite.create.mock.calls[0][0].data;
    expect(createArg.permissions).toEqual([]);
  });
});

// ── getInvite ─────────────────────────────────────────────────────────────────

describe("getInvite", () => {
  it("returns null for an unknown token", async () => {
    prismaMock.clientUserInvite.findUnique.mockResolvedValue(null);
    expect(await getInvite("bad_token")).toBeNull();
  });

  it("returns null for an expired invite", async () => {
    prismaMock.clientUserInvite.findUnique.mockResolvedValue({
      status: "pending",
      expiresAt: new Date(Date.now() - 1000),
      email: "a@b.com",
      role: "staff",
      clientId: "c1",
      client: { businessName: "Acme" },
    });
    expect(await getInvite("tok")).toBeNull();
  });

  it("returns invite info for a valid pending token", async () => {
    prismaMock.clientUserInvite.findUnique.mockResolvedValue({
      status: "pending",
      expiresAt: new Date(Date.now() + 86_400_000),
      email: "a@b.com",
      role: "staff",
      clientId: "c1",
      client: { businessName: "Acme" },
    });
    const info = await getInvite("valid_tok");
    expect(info?.email).toBe("a@b.com");
    expect(info?.businessName).toBe("Acme");
  });
});

// ── acceptInvite ──────────────────────────────────────────────────────────────

describe("acceptInvite", () => {
  const validInvite = {
    id: "i1",
    status: "pending",
    expiresAt: new Date(Date.now() + 86_400_000),
    email: "new@x.com",
    role: "staff",
    clientId: "c1",
    permissions: [],
  };

  it("throws 404 invite_invalid when token is missing", async () => {
    prismaMock.clientUserInvite.findUnique.mockResolvedValue(null);
    await expect(acceptInvite("bad_tok", { userId: "u1" })).rejects.toMatchObject({ status: 404, code: "invite_invalid" });
  });

  it("throws 409 email_mismatch when signed-in user's email doesn't match the invite", async () => {
    prismaMock.clientUserInvite.findUnique.mockResolvedValue(validInvite);
    prismaMock.subscription.findUnique.mockResolvedValue({ plan: { featureFlags: { teamSeats: 5 } } });
    prismaMock.clientUser.count.mockResolvedValue(1);
    prismaMock.user.findUnique.mockResolvedValue({ email: "other@x.com", clientUser: null });

    await expect(acceptInvite("tok", { userId: "u_other" })).rejects.toMatchObject({ status: 409, code: "email_mismatch" });
  });

  it("throws 409 already_on_a_team when signed-in user is already on a team", async () => {
    prismaMock.clientUserInvite.findUnique.mockResolvedValue(validInvite);
    prismaMock.subscription.findUnique.mockResolvedValue({ plan: { featureFlags: { teamSeats: 5 } } });
    prismaMock.clientUser.count.mockResolvedValue(1);
    prismaMock.user.findUnique.mockResolvedValue({ email: "new@x.com", clientUser: { id: "cu1" } });

    await expect(acceptInvite("tok", { userId: "u1" })).rejects.toMatchObject({ status: 409, code: "already_on_a_team" });
  });

  it("accepts invite for a signed-in user with matching email", async () => {
    prismaMock.clientUserInvite.findUnique.mockResolvedValue(validInvite);
    prismaMock.subscription.findUnique.mockResolvedValue({ plan: { featureFlags: { teamSeats: 5 } } });
    prismaMock.clientUser.count.mockResolvedValue(1);
    prismaMock.user.findUnique.mockResolvedValue({ email: "new@x.com", clientUser: null });
    prismaMock.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops));
    prismaMock.clientUser.create.mockResolvedValue({});
    prismaMock.clientUserInvite.update.mockResolvedValue({});

    const result = await acceptInvite("tok", { userId: "u1" });
    expect(result.clientId).toBe("c1");
    expect(result.createdAccount).toBe(false);
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "team.joined" }));
  });

  it("throws 400 password_required when accepting without userId and no/short password", async () => {
    prismaMock.clientUserInvite.findUnique.mockResolvedValue(validInvite);
    prismaMock.subscription.findUnique.mockResolvedValue({ plan: { featureFlags: { teamSeats: 5 } } });
    prismaMock.clientUser.count.mockResolvedValue(1);

    await expect(acceptInvite("tok", { password: "short" })).rejects.toMatchObject({ status: 400, code: "password_required" });
  });

  it("creates a new account when no userId provided and password is valid", async () => {
    prismaMock.clientUserInvite.findUnique.mockResolvedValue(validInvite);
    prismaMock.subscription.findUnique.mockResolvedValue({ plan: { featureFlags: { teamSeats: 5 } } });
    prismaMock.clientUser.count.mockResolvedValue(1);
    vi.mocked(createAuthUser).mockResolvedValue({ ok: true, id: "sb_new" } as never);
    prismaMock.user.findUnique.mockResolvedValue(null); // no existing user
    prismaMock.user.create.mockResolvedValue({ id: "u_new" });
    prismaMock.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops));
    prismaMock.clientUser.create.mockResolvedValue({});
    prismaMock.clientUserInvite.update.mockResolvedValue({});

    const result = await acceptInvite("tok", { name: "Alice", password: "validpassword" });
    expect(result.createdAccount).toBe(true);
  });
});

// ── declineInviteByToken ──────────────────────────────────────────────────────

describe("declineInviteByToken", () => {
  it("resolves silently for an unknown token (idempotent)", async () => {
    prismaMock.clientUserInvite.findUnique.mockResolvedValue(null);
    await expect(declineInviteByToken("unknown")).resolves.toBeUndefined();
    expect(prismaMock.clientUserInvite.update).not.toHaveBeenCalled();
  });

  it("does not update already-accepted invites", async () => {
    prismaMock.clientUserInvite.findUnique.mockResolvedValue({ id: "i1", clientId: "c1", status: "accepted" });
    await declineInviteByToken("tok");
    expect(prismaMock.clientUserInvite.update).not.toHaveBeenCalled();
  });

  it("marks a pending invite declined and audits", async () => {
    prismaMock.clientUserInvite.findUnique.mockResolvedValue({ id: "i1", clientId: "c1", status: "pending" });
    prismaMock.clientUserInvite.update.mockResolvedValue({});

    await declineInviteByToken("tok");
    expect(prismaMock.clientUserInvite.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { status: "declined" } });
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "team.invite_declined" }));
  });
});

// ── revokeInvite ──────────────────────────────────────────────────────────────

describe("revokeInvite", () => {
  it("throws 404 not_found when invite is not found for the client", async () => {
    prismaMock.clientUserInvite.findFirst.mockResolvedValue(null);
    await expect(revokeInvite("c1", "i1")).rejects.toMatchObject({ status: 404, code: "not_found" });
  });

  it("revokes and audits when found", async () => {
    prismaMock.clientUserInvite.findFirst.mockResolvedValue({ id: "i1" });
    prismaMock.clientUserInvite.update.mockResolvedValue({});
    const result = await revokeInvite("c1", "i1");
    expect(result).toEqual({ id: "i1" });
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "team.invite_revoked" }));
  });
});

// ── removeMember ──────────────────────────────────────────────────────────────

describe("removeMember", () => {
  it("throws 400 cannot_remove_self", async () => {
    await expect(removeMember("c1", "u1", "u1")).rejects.toMatchObject({ status: 400, code: "cannot_remove_self" });
  });

  it("throws 404 not_found when member is not in this client", async () => {
    prismaMock.clientUser.findFirst.mockResolvedValue(null);
    await expect(removeMember("c1", "u1", "u2")).rejects.toMatchObject({ status: 404, code: "not_found" });
  });

  it("throws 403 cannot_remove_owner", async () => {
    prismaMock.clientUser.findFirst.mockResolvedValue({ id: "cu1", role: "owner" });
    await expect(removeMember("c1", "u1", "u_owner")).rejects.toMatchObject({ status: 403, code: "cannot_remove_owner" });
  });

  it("deletes and audits on success", async () => {
    prismaMock.clientUser.findFirst.mockResolvedValue({ id: "cu1", role: "staff" });
    prismaMock.clientUser.delete.mockResolvedValue({});

    const result = await removeMember("c1", "u_actor", "u_staff");
    expect(result).toEqual({ userId: "u_staff" });
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "team.member_removed" }));
  });
});

// ── setMemberDisabled ─────────────────────────────────────────────────────────

describe("setMemberDisabled", () => {
  it("throws 400 cannot_disable_self", async () => {
    await expect(setMemberDisabled("c1", "u1", "u1", true)).rejects.toMatchObject({ status: 400, code: "cannot_disable_self" });
  });

  it("throws 404 not_found when member is not in this client", async () => {
    prismaMock.clientUser.findFirst.mockResolvedValue(null);
    await expect(setMemberDisabled("c1", "u1", "u2", true)).rejects.toMatchObject({ status: 404, code: "not_found" });
  });

  it("throws 403 cannot_disable_owner", async () => {
    prismaMock.clientUser.findFirst.mockResolvedValue({ role: "owner" });
    await expect(setMemberDisabled("c1", "u1", "u_owner", true)).rejects.toMatchObject({ status: 403, code: "cannot_disable_owner" });
  });

  it("sets status DISABLED and audits when disabling", async () => {
    prismaMock.clientUser.findFirst.mockResolvedValue({ role: "staff" });
    prismaMock.user.update.mockResolvedValue({});

    const result = await setMemberDisabled("c1", "u_actor", "u_staff", true);
    expect(result).toEqual({ userId: "u_staff", disabled: true });
    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: "u_staff" }, data: { status: "DISABLED" } });
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "team.member_disabled" }));
  });

  it("sets status ACTIVE and audits when re-enabling", async () => {
    prismaMock.clientUser.findFirst.mockResolvedValue({ role: "staff" });
    prismaMock.user.update.mockResolvedValue({});

    await setMemberDisabled("c1", "u_actor", "u_staff", false);
    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { id: "u_staff" }, data: { status: "ACTIVE" } });
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "team.member_enabled" }));
  });
});

// ── updateMemberPermissions ───────────────────────────────────────────────────

describe("updateMemberPermissions", () => {
  it("throws 404 not_found when member is not in this client", async () => {
    prismaMock.clientUser.findFirst.mockResolvedValue(null);
    await expect(updateMemberPermissions("c1", "u2", [])).rejects.toMatchObject({ status: 404, code: "not_found" });
  });

  it("throws 400 cannot_edit_owner when the member is the owner", async () => {
    prismaMock.clientUser.findFirst.mockResolvedValue({ id: "cu1", role: "owner" });
    await expect(updateMemberPermissions("c1", "u_owner", [])).rejects.toMatchObject({ status: 400, code: "cannot_edit_owner" });
  });

  it("sanitizes permissions and updates, audits on success", async () => {
    prismaMock.clientUser.findFirst.mockResolvedValue({ id: "cu1", role: "staff" });
    prismaMock.clientUser.update.mockResolvedValue({});

    const result = await updateMemberPermissions("c1", "u_staff", ["finance:manage", "totally:fake"]);
    // finance:manage is valid; totally:fake is dropped; finance:view is added by sanitize
    expect(result.permissions).toContain("finance:manage");
    expect(result.permissions).toContain("finance:view");
    expect(result.permissions).not.toContain("totally:fake");
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "team.permissions_updated" }));
  });
});

describe("TeamError", () => {
  it("is an instance of Error with status and code properties", () => {
    const e = new TeamError(404, "not_found");
    expect(e).toBeInstanceOf(Error);
    expect(e.status).toBe(404);
    expect(e.code).toBe("not_found");
    expect(e.message).toBe("not_found");
  });
});
