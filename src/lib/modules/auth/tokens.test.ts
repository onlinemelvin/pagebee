import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

// tokens.ts uses node:crypto — no external side-effects to mock beyond the DB.

import { createAuthToken, consumeAuthToken } from "./tokens";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createAuthToken", () => {
  it("invalidates prior pending tokens of the same type before creating a new one", async () => {
    prismaMock.authToken.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.authToken.create.mockResolvedValue({ id: "t1" });

    await createAuthToken({ userId: "u1", email: "a@b.com", type: "PASSWORD_RESET", ttlMinutes: 30 });

    expect(prismaMock.authToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", type: "PASSWORD_RESET", usedAt: null } }),
    );
  });

  it("returns a raw token starting with the correct prefix for PASSWORD_RESET", async () => {
    prismaMock.authToken.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.authToken.create.mockResolvedValue({ id: "t1" });

    const raw = await createAuthToken({ userId: "u1", email: "a@b.com", type: "PASSWORD_RESET", ttlMinutes: 30 });

    expect(raw).toMatch(/^prt_/);
  });

  it("returns a raw token starting with the correct prefix for EMAIL_VERIFY", async () => {
    prismaMock.authToken.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.authToken.create.mockResolvedValue({ id: "t1" });

    const raw = await createAuthToken({ userId: "u2", email: "b@c.com", type: "EMAIL_VERIFY", ttlMinutes: 60 });

    expect(raw).toMatch(/^evt_/);
  });

  it("persists a hash (not the raw token), email lowercased, and correct expiry", async () => {
    prismaMock.authToken.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.authToken.create.mockResolvedValue({ id: "t1" });

    const before = Date.now();
    const raw = await createAuthToken({ userId: "u1", email: "Ada@Example.COM", type: "PASSWORD_RESET", ttlMinutes: 30 });
    const after = Date.now();

    const callArg = prismaMock.authToken.create.mock.calls[0][0].data;
    expect(callArg.tokenHash).not.toBe(raw); // stored hash, not raw
    expect(callArg.tokenHash).toMatch(/^[a-f0-9]{64}$/); // sha256 hex
    expect(callArg.email).toBe("ada@example.com");
    expect(callArg.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 30 * 60_000 - 100);
    expect(callArg.expiresAt.getTime()).toBeLessThanOrEqual(after + 30 * 60_000 + 100);
  });

  it("each call generates a different raw token (randomness)", async () => {
    prismaMock.authToken.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.authToken.create.mockResolvedValue({ id: "t1" });

    const a = await createAuthToken({ userId: "u1", email: "a@b.com", type: "PASSWORD_RESET", ttlMinutes: 30 });
    const b = await createAuthToken({ userId: "u1", email: "a@b.com", type: "PASSWORD_RESET", ttlMinutes: 30 });
    expect(a).not.toBe(b);
  });
});

describe("consumeAuthToken", () => {
  it("returns null when the token hash is not in the DB", async () => {
    prismaMock.authToken.findUnique.mockResolvedValue(null);
    const result = await consumeAuthToken("bad_token", "PASSWORD_RESET");
    expect(result).toBeNull();
    expect(prismaMock.authToken.updateMany).not.toHaveBeenCalled();
  });

  it("returns null when the token type does not match", async () => {
    prismaMock.authToken.findUnique.mockResolvedValue({
      id: "t1",
      userId: "u1",
      email: "a@b.com",
      type: "EMAIL_VERIFY",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await consumeAuthToken("some_raw_token", "PASSWORD_RESET");
    expect(result).toBeNull();
  });

  it("returns null when the token has already been used", async () => {
    prismaMock.authToken.findUnique.mockResolvedValue({
      id: "t1",
      userId: "u1",
      email: "a@b.com",
      type: "PASSWORD_RESET",
      usedAt: new Date(Date.now() - 1000),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await consumeAuthToken("some_raw_token", "PASSWORD_RESET");
    expect(result).toBeNull();
  });

  it("returns null when the token is expired", async () => {
    prismaMock.authToken.findUnique.mockResolvedValue({
      id: "t1",
      userId: "u1",
      email: "a@b.com",
      type: "PASSWORD_RESET",
      usedAt: null,
      expiresAt: new Date(Date.now() - 1000), // past
    });

    const result = await consumeAuthToken("some_raw_token", "PASSWORD_RESET");
    expect(result).toBeNull();
  });

  it("marks the token used and returns userId + email on success", async () => {
    prismaMock.authToken.findUnique.mockResolvedValue({
      id: "t1",
      userId: "u1",
      email: "a@b.com",
      type: "PASSWORD_RESET",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prismaMock.authToken.updateMany.mockResolvedValue({ count: 1 });

    const result = await consumeAuthToken("some_raw_token", "PASSWORD_RESET");
    expect(result).toEqual({ userId: "u1", email: "a@b.com" });
    expect(prismaMock.authToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "t1", usedAt: null }, data: { usedAt: expect.any(Date) } }),
    );
  });

  it("returns null when the race-condition update returns count 0 (token already consumed by another request)", async () => {
    prismaMock.authToken.findUnique.mockResolvedValue({
      id: "t1",
      userId: "u1",
      email: "a@b.com",
      type: "PASSWORD_RESET",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prismaMock.authToken.updateMany.mockResolvedValue({ count: 0 }); // race lost

    const result = await consumeAuthToken("some_raw_token", "PASSWORD_RESET");
    expect(result).toBeNull();
  });
});
