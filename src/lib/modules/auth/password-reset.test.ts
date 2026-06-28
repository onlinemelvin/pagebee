import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ updateAuthUserPassword: vi.fn() }));
vi.mock("@/lib/modules/email/notifications", () => ({
  sendPasswordReset: vi.fn(),
  sendPasswordChanged: vi.fn(),
}));
vi.mock("@/lib/modules/email", () => ({ appBase: () => "https://pagebee.com" }));
// Stub tokens module so tests control outputs directly.
vi.mock("./tokens", () => ({
  createAuthToken: vi.fn(),
  consumeAuthToken: vi.fn(),
}));

import { requestPasswordReset, resetPassword, AuthFlowError } from "./password-reset";
import { writeAudit } from "@/lib/modules/audit";
import { updateAuthUserPassword } from "@/lib/supabase/admin";
import * as notify from "@/lib/modules/email/notifications";
import { createAuthToken, consumeAuthToken } from "./tokens";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requestPasswordReset", () => {
  it("silently returns when the user is not found (no account enumeration)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(requestPasswordReset("nobody@x.com")).resolves.toBeUndefined();
    expect(notify.sendPasswordReset).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("silently returns when the user is DISABLED (no account enumeration)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", name: "Alice", status: "DISABLED" });
    await expect(requestPasswordReset("alice@x.com")).resolves.toBeUndefined();
    expect(notify.sendPasswordReset).not.toHaveBeenCalled();
  });

  it("normalises the email to lowercase before lookup", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await requestPasswordReset("Alice@Example.COM");
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "alice@example.com" } }),
    );
  });

  it("creates a token, sends the reset email, and audits for a valid active user", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", name: "Alice", status: "ACTIVE" });
    vi.mocked(createAuthToken).mockResolvedValue("prt_abc123");

    await requestPasswordReset("alice@x.com");

    expect(createAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", type: "PASSWORD_RESET" }),
    );
    expect(notify.sendPasswordReset).toHaveBeenCalledWith(
      "alice@x.com",
      expect.objectContaining({ resetUrl: expect.stringContaining("prt_abc123") }),
    );
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.password_reset_requested", entityId: "u1" }),
    );
  });
});

describe("resetPassword", () => {
  it("throws AuthFlowError(400, invalid_or_expired_token) when consumeAuthToken returns null", async () => {
    vi.mocked(consumeAuthToken).mockResolvedValue(null);
    await expect(resetPassword("bad_token", "newpass123")).rejects.toMatchObject({
      status: 400,
      code: "invalid_or_expired_token",
    });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("throws AuthFlowError(400, no_auth_identity) when the user has no supabaseUserId", async () => {
    vi.mocked(consumeAuthToken).mockResolvedValue({ userId: "u1", email: "a@b.com" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", name: "Alice", email: "a@b.com", supabaseUserId: null });

    await expect(resetPassword("token", "newpass123")).rejects.toMatchObject({
      status: 400,
      code: "no_auth_identity",
    });
    expect(updateAuthUserPassword).not.toHaveBeenCalled();
  });

  it("throws AuthFlowError(502) when Supabase password update fails", async () => {
    vi.mocked(consumeAuthToken).mockResolvedValue({ userId: "u1", email: "a@b.com" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", name: "Alice", email: "a@b.com", supabaseUserId: "sb1" });
    vi.mocked(updateAuthUserPassword).mockResolvedValue({ ok: false, error: "auth_error" });

    await expect(resetPassword("token", "newpass123")).rejects.toMatchObject({
      status: 502,
      code: "auth_error",
    });
  });

  it("updates the user, audits, and sends confirmation email on success", async () => {
    vi.mocked(consumeAuthToken).mockResolvedValue({ userId: "u1", email: "a@b.com" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", name: "Alice", email: "a@b.com", supabaseUserId: "sb1" });
    vi.mocked(updateAuthUserPassword).mockResolvedValue({ ok: true });
    prismaMock.user.update.mockResolvedValue({ id: "u1" });

    await resetPassword("token", "newpass123");

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u1" } }),
    );
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.password_reset", entityId: "u1" }),
    );
    expect(notify.sendPasswordChanged).toHaveBeenCalledWith(
      "a@b.com",
      expect.objectContaining({ name: "Alice" }),
    );
  });

  it("first-time rep invite: sets the password but skips the 'password changed' email", async () => {
    // No PASSWORD_RESET token matches; it's a REP_INVITE token instead.
    vi.mocked(consumeAuthToken).mockResolvedValueOnce(null).mockResolvedValueOnce({ userId: "u1", email: "rep@b.com" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", name: "Jane", email: "rep@b.com", supabaseUserId: "sb1" });
    vi.mocked(updateAuthUserPassword).mockResolvedValue({ ok: true });
    prismaMock.user.update.mockResolvedValue({ id: "u1" });

    await resetPassword("rit_token", "newpass123");

    expect(consumeAuthToken).toHaveBeenNthCalledWith(1, "rit_token", "PASSWORD_RESET");
    expect(consumeAuthToken).toHaveBeenNthCalledWith(2, "rit_token", "REP_INVITE");
    expect(updateAuthUserPassword).toHaveBeenCalledWith("sb1", "newpass123");
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.invite_accepted", entityId: "u1" }),
    );
    expect(notify.sendPasswordChanged).not.toHaveBeenCalled();
  });

  it("AuthFlowError is an instance of Error", () => {
    const e = new AuthFlowError(403, "forbidden");
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe("forbidden");
    expect(e.status).toBe(403);
    expect(e.code).toBe("forbidden");
  });
});
