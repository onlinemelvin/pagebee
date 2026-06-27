import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

import {
  isSuppressed,
  unsubscribeUrlFor,
  resolveUnsubscribeToken,
  unsubscribe,
  resubscribe,
  suppressFromProvider,
} from "./preferences";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isSuppressed", () => {
  it("returns true when a non-anchor suppression row exists", async () => {
    prismaMock.emailUnsubscribe.findFirst.mockResolvedValue({ id: "row1" } as never);
    expect(await isSuppressed("user@example.com", "TIPS")).toBe(true);
  });

  it("returns false when no suppression row exists", async () => {
    prismaMock.emailUnsubscribe.findFirst.mockResolvedValue(null);
    expect(await isSuppressed("user@example.com", "TIPS")).toBe(false);
  });

  it("normalizes email to lowercase before querying", async () => {
    prismaMock.emailUnsubscribe.findFirst.mockResolvedValue(null);
    await isSuppressed("User@EXAMPLE.COM", "ANNOUNCEMENT");
    expect(prismaMock.emailUnsubscribe.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ email: "user@example.com" }),
      }),
    );
  });
});

describe("unsubscribeUrlFor", () => {
  it("reuses an existing token when one is found", async () => {
    prismaMock.emailUnsubscribe.findFirst.mockResolvedValue({ token: "uns_existing123" } as never);
    const result = await unsubscribeUrlFor("user@example.com", "client1");
    expect(result.token).toBe("uns_existing123");
    expect(result.pageUrl).toContain("uns_existing123");
    expect(result.oneClickUrl).toContain("uns_existing123");
    expect(prismaMock.emailUnsubscribe.create).not.toHaveBeenCalled();
  });

  it("creates an anchor row when no token exists", async () => {
    prismaMock.emailUnsubscribe.findFirst.mockResolvedValue(null);
    prismaMock.emailUnsubscribe.create.mockResolvedValue({ id: "newrow" } as never);
    const result = await unsubscribeUrlFor("new@example.com", "c1");
    expect(prismaMock.emailUnsubscribe.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reason: "anchor", category: null }),
      }),
    );
    expect(result.token).toBeTruthy();
    expect(result.token).toMatch(/^uns_/);
  });
});

describe("resolveUnsubscribeToken", () => {
  it("returns email and clientId when token is found", async () => {
    prismaMock.emailUnsubscribe.findUnique.mockResolvedValue({ email: "u@x.com", clientId: "c1" } as never);
    const result = await resolveUnsubscribeToken("some-token");
    expect(result).toEqual({ email: "u@x.com", clientId: "c1" });
  });

  it("returns null when token is not found", async () => {
    prismaMock.emailUnsubscribe.findUnique.mockResolvedValue(null);
    const result = await resolveUnsubscribeToken("bad-token");
    expect(result).toBeNull();
  });
});

describe("unsubscribe", () => {
  it("returns null when anchor token does not exist", async () => {
    prismaMock.emailUnsubscribe.findUnique.mockResolvedValue(null);
    const result = await unsubscribe("bad-token");
    expect(result).toBeNull();
  });

  it("upserts a category-specific suppression when category is given", async () => {
    prismaMock.emailUnsubscribe.findUnique.mockResolvedValue({ email: "u@x.com", clientId: "c1" } as never);
    prismaMock.emailUnsubscribe.upsert.mockResolvedValue({} as never);
    const result = await unsubscribe("tok", { category: "TIPS" as never });
    expect(result).toEqual({ email: "u@x.com" });
    expect(prismaMock.emailUnsubscribe.upsert).toHaveBeenCalled();
    expect(prismaMock.emailUnsubscribe.update).not.toHaveBeenCalled();
  });

  it("updates the anchor row for an all-marketing opt-out (no category)", async () => {
    prismaMock.emailUnsubscribe.findUnique.mockResolvedValue({ email: "u@x.com", clientId: null } as never);
    prismaMock.emailUnsubscribe.update.mockResolvedValue({} as never);
    const result = await unsubscribe("tok");
    expect(result).toEqual({ email: "u@x.com" });
    expect(prismaMock.emailUnsubscribe.update).toHaveBeenCalled();
    expect(prismaMock.emailUnsubscribe.upsert).not.toHaveBeenCalled();
  });
});

describe("resubscribe", () => {
  it("clears suppressions by setting reason to anchor", async () => {
    prismaMock.emailUnsubscribe.updateMany.mockResolvedValue({ count: 2 } as never);
    await resubscribe("User@EXAMPLE.COM");
    expect(prismaMock.emailUnsubscribe.updateMany).toHaveBeenCalledWith({
      where: { email: "user@example.com" },
      data: { reason: "anchor" },
    });
  });
});

describe("suppressFromProvider", () => {
  it("updates an existing null-category row when found (bounce)", async () => {
    prismaMock.emailUnsubscribe.findFirst.mockResolvedValue({ id: "existing-row" } as never);
    prismaMock.emailUnsubscribe.update.mockResolvedValue({} as never);
    await suppressFromProvider("u@x.com", "bounce");
    expect(prismaMock.emailUnsubscribe.update).toHaveBeenCalledWith({
      where: { id: "existing-row" },
      data: { reason: "bounce" },
    });
    expect(prismaMock.emailUnsubscribe.create).not.toHaveBeenCalled();
  });

  it("creates a new null-category row when none exists (complaint)", async () => {
    prismaMock.emailUnsubscribe.findFirst.mockResolvedValue(null);
    prismaMock.emailUnsubscribe.create.mockResolvedValue({} as never);
    await suppressFromProvider("new@x.com", "complaint");
    expect(prismaMock.emailUnsubscribe.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "new@x.com", category: null, reason: "complaint" }),
      }),
    );
  });
});
