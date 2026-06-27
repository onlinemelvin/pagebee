import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

import { recordUsage, limitFor, getMonthlyUsage, requireWithinLimit, getUsageSummary, UsageError } from "./service";

beforeEach(() => {
  vi.clearAllMocks();
});

// ── recordUsage ───────────────────────────────────────────────────────────────

describe("recordUsage", () => {
  it("creates a usageRecord with quantity 1 by default", async () => {
    prismaMock.usageRecord.create.mockResolvedValue({} as never);
    await recordUsage("c1", "aiReplies");
    expect(prismaMock.usageRecord.create).toHaveBeenCalledWith({
      data: { clientId: "c1", key: "aiReplies", quantity: 1 },
    });
  });

  it("creates a usageRecord with the explicit quantity", async () => {
    prismaMock.usageRecord.create.mockResolvedValue({} as never);
    await recordUsage("c1", "sms", 5);
    expect(prismaMock.usageRecord.create).toHaveBeenCalledWith({
      data: { clientId: "c1", key: "sms", quantity: 5 },
    });
  });
});

// ── limitFor ──────────────────────────────────────────────────────────────────

describe("limitFor", () => {
  it("returns the plan's invoicesIncludedMonthly for the invoices key", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ plan: { featureFlags: { invoicesIncludedMonthly: 10 } } });
    expect(await limitFor("c1", "invoices")).toBe(10);
  });

  it("returns null when the flag is absent (not metered on this plan)", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ plan: { featureFlags: {} } });
    expect(await limitFor("c1", "invoices")).toBeNull();
  });

  it("returns null when the flag value is a string rather than a number", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ plan: { featureFlags: { invoicesIncludedMonthly: "unlimited" } } });
    expect(await limitFor("c1", "invoices")).toBeNull();
  });

  it("returns null when no subscription row exists", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    expect(await limitFor("c1", "invoices")).toBeNull();
  });

  it("returns null for an unknown key (no FLAG_FOR entry)", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ plan: { featureFlags: { invoicesIncludedMonthly: 10 } } });
    expect(await limitFor("c1", "unknownKey")).toBeNull();
  });

  it("returns aiRepliesIncludedMonthly for the aiReplies key", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ plan: { featureFlags: { aiRepliesIncludedMonthly: 50 } } });
    expect(await limitFor("c1", "aiReplies")).toBe(50);
  });
});

// ── getMonthlyUsage ────────────────────────────────────────────────────────────

describe("getMonthlyUsage", () => {
  it("returns invoice count for the invoices key (source-of-truth counter)", async () => {
    prismaMock.invoice.count.mockResolvedValue(3);
    const usage = await getMonthlyUsage("c1", "invoices");
    expect(usage).toBe(3);
    expect(prismaMock.invoice.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ clientId: "c1", docType: "INVOICE" }) }),
    );
  });

  it("returns 0 for an unknown key (no counter registered)", async () => {
    const usage = await getMonthlyUsage("c1", "unknownKey");
    expect(usage).toBe(0);
  });

  it("returns sum of usageRecord quantities for the aiReplies key", async () => {
    prismaMock.usageRecord.aggregate.mockResolvedValue({ _sum: { quantity: 12 } } as never);
    const usage = await getMonthlyUsage("c1", "aiReplies");
    expect(usage).toBe(12);
  });

  it("returns 0 when the usageRecord aggregate sum is null", async () => {
    prismaMock.usageRecord.aggregate.mockResolvedValue({ _sum: { quantity: null } } as never);
    const usage = await getMonthlyUsage("c1", "sms");
    expect(usage).toBe(0);
  });
});

// ── requireWithinLimit ────────────────────────────────────────────────────────

describe("requireWithinLimit", () => {
  it("does not throw when the key is not metered on this plan (limit null)", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ plan: { featureFlags: {} } }); // no flag → null limit
    await expect(requireWithinLimit("c1", "invoices")).resolves.toBeUndefined();
  });

  it("does not throw when usage is below the limit", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ plan: { featureFlags: { invoicesIncludedMonthly: 10 } } });
    prismaMock.invoice.count.mockResolvedValue(5);
    await expect(requireWithinLimit("c1", "invoices")).resolves.toBeUndefined();
  });

  it("does not throw when usage equals limit - 1", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ plan: { featureFlags: { invoicesIncludedMonthly: 10 } } });
    prismaMock.invoice.count.mockResolvedValue(9);
    await expect(requireWithinLimit("c1", "invoices")).resolves.toBeUndefined();
  });

  it("throws UsageError(429) when usage equals the limit", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ plan: { featureFlags: { invoicesIncludedMonthly: 10 } } });
    prismaMock.invoice.count.mockResolvedValue(10);
    await expect(requireWithinLimit("c1", "invoices")).rejects.toMatchObject({
      status: 429,
      code: "usage_limit_reached",
      meta: { key: "invoices", used: 10, limit: 10 },
    });
  });

  it("throws UsageError(429) when usage exceeds the limit", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ plan: { featureFlags: { invoicesIncludedMonthly: 10 } } });
    prismaMock.invoice.count.mockResolvedValue(15);
    await expect(requireWithinLimit("c1", "invoices")).rejects.toMatchObject({ status: 429, code: "usage_limit_reached" });
  });
});

// ── getUsageSummary ───────────────────────────────────────────────────────────

describe("getUsageSummary", () => {
  it("returns used, limit, and key", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ plan: { featureFlags: { invoicesIncludedMonthly: 10 } } });
    prismaMock.invoice.count.mockResolvedValue(4);

    const summary = await getUsageSummary("c1", "invoices");
    expect(summary).toEqual({ key: "invoices", used: 4, limit: 10 });
  });

  it("returns null limit when not metered", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ plan: { featureFlags: {} } });
    prismaMock.invoice.count.mockResolvedValue(0);

    const summary = await getUsageSummary("c1", "invoices");
    expect(summary.limit).toBeNull();
  });
});

// ── UsageError ────────────────────────────────────────────────────────────────

describe("UsageError", () => {
  it("is an Error with status, code, and meta", () => {
    const e = new UsageError(429, "usage_limit_reached", { key: "invoices", used: 10, limit: 10 });
    expect(e).toBeInstanceOf(Error);
    expect(e.status).toBe(429);
    expect(e.code).toBe("usage_limit_reached");
    expect(e.meta).toEqual({ key: "invoices", used: 10, limit: 10 });
  });

  it("can be constructed without meta", () => {
    const e = new UsageError(429, "usage_limit_reached");
    expect(e.meta).toBeUndefined();
  });
});
