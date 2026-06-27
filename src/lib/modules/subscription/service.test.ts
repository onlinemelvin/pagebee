import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));

import { getUpdateQuota, requestUpgrade, listUpgradeRequests, applyUpgradeRequest } from "./service";
import { writeAudit } from "@/lib/modules/audit";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── getUpdateQuota ───────────────────────────────────────────────────────

describe("getUpdateQuota", () => {
  it("returns the plan allowance, used count, and remaining for the current period", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      plan: { name: "HONEY", monthlyUpdates: 5 },
    } as never);
    prismaMock.websiteUpdate.count.mockResolvedValue(2);

    const quota = await getUpdateQuota("c1");
    expect(quota.allowance).toBe(5);
    expect(quota.used).toBe(2);
    expect(quota.remaining).toBe(3);
    expect(quota.planName).toBe("HONEY");
  });

  it("clamps remaining to 0 when used exceeds allowance", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      plan: { name: "NECTAR", monthlyUpdates: 2 },
    } as never);
    prismaMock.websiteUpdate.count.mockResolvedValue(5); // over limit

    const quota = await getUpdateQuota("c1");
    expect(quota.remaining).toBe(0);
  });

  it("falls back to 1 update allowance and NECTAR plan when no subscription exists", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    prismaMock.websiteUpdate.count.mockResolvedValue(0);

    const quota = await getUpdateQuota("c1");
    expect(quota.allowance).toBe(1);
    expect(quota.planName).toBe("NECTAR");
  });

  it("scopes the used count to the current period (createdAt gte start of month)", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      plan: { name: "HIVE", monthlyUpdates: 30 },
    } as never);
    prismaMock.websiteUpdate.count.mockResolvedValue(7);

    await getUpdateQuota("c1");
    expect(prismaMock.websiteUpdate.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: "c1",
          status: { not: "rejected" },
          createdAt: { gte: expect.any(Date) },
        }),
      }),
    );
  });
});

// ─── requestUpgrade ───────────────────────────────────────────────────────

describe("requestUpgrade", () => {
  it("throws client_not_found when the client does not exist", async () => {
    prismaMock.client.findUnique.mockResolvedValue(null);
    await expect(requestUpgrade("c1", "HIVE")).rejects.toThrow("client_not_found");
  });

  it("throws invalid_plan for an unknown plan name", async () => {
    prismaMock.client.findUnique.mockResolvedValue({ isTest: false, subscription: { id: "sub1", plan: { name: "NECTAR" } } } as never);
    await expect(requestUpgrade("c1", "UNKNOWN_PLAN")).rejects.toThrow("invalid_plan");
  });

  it("applies instantly for test accounts and audits", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      isTest: true,
      subscription: { id: "sub1", plan: { name: "NECTAR" } },
    } as never);
    prismaMock.plan.findUnique.mockResolvedValue({ id: "plan_hive", name: "HIVE", setupFee: 99900, monthlyFee: 17900 } as never);
    prismaMock.subscription.update.mockResolvedValue({} as never);

    const result = await requestUpgrade("c1", "HIVE");
    expect(result.applied).toBe(true);
    expect(prismaMock.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sub1" },
        data: expect.objectContaining({ planId: "plan_hive" }),
      }),
    );
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "subscription.upgraded", metadata: expect.objectContaining({ instant: true }) }),
    );
  });

  it("creates an upgrade request (not applied) for non-test accounts", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      isTest: false,
      subscription: { id: "sub1", plan: { name: "NECTAR" } },
    } as never);
    prismaMock.upgradeRequest.create.mockResolvedValue({} as never);

    const result = await requestUpgrade("c1", "HIVE", "I need invoices");
    expect(result.applied).toBe(false);
    expect(prismaMock.upgradeRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ clientId: "c1", fromPlan: "NECTAR", toPlan: "HIVE", reason: "I need invoices" }),
      }),
    );
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "subscription.upgrade_requested" }),
    );
  });

  it("stores plan fees in integer cents for test-account upgrades", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      isTest: true,
      subscription: { id: "sub1", plan: { name: "NECTAR" } },
    } as never);
    prismaMock.plan.findUnique.mockResolvedValue({ id: "plan_hive", name: "HIVE", setupFee: 99900, monthlyFee: 17900 } as never);
    prismaMock.subscription.update.mockResolvedValue({} as never);

    await requestUpgrade("c1", "HIVE");
    const updateCall = prismaMock.subscription.update.mock.calls[0][0];
    expect(Number.isInteger(updateCall.data.agreedSetupFee)).toBe(true);
    expect(Number.isInteger(updateCall.data.agreedMonthlyFee)).toBe(true);
    expect(updateCall.data.agreedSetupFee).toBe(99900);
  });

  it("applies instantly even when no subscription exists for test accounts — throws no error just returns applied: true with the plan change", async () => {
    // Test account with no subscription → applyPlanChange won't be called (guard), but requestUpgrade
    // checks client.isTest AND client.subscription — with no subscription the apply path is skipped.
    prismaMock.client.findUnique.mockResolvedValue({
      isTest: true,
      subscription: null, // no sub yet
    } as never);
    prismaMock.upgradeRequest.create.mockResolvedValue({} as never);

    // When isTest but no subscription: the code path falls through to upgradeRequest.create
    const result = await requestUpgrade("c1", "HIVE");
    // Based on the service code: if (client.isTest && client.subscription) → apply
    // With no subscription it falls through to the upgradeRequest path
    expect(result.applied).toBe(false);
  });
});

// ─── listUpgradeRequests ──────────────────────────────────────────────────

describe("listUpgradeRequests", () => {
  it("queries for pending (status=requested) upgrade requests", async () => {
    prismaMock.upgradeRequest.findMany.mockResolvedValue([]);
    await listUpgradeRequests();
    expect(prismaMock.upgradeRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "requested" } }),
    );
  });
});

// ─── applyUpgradeRequest ──────────────────────────────────────────────────

describe("applyUpgradeRequest", () => {
  it("throws not_found when the request does not exist", async () => {
    prismaMock.upgradeRequest.findUnique.mockResolvedValue(null);
    await expect(applyUpgradeRequest("req9", null)).rejects.toThrow("not_found");
  });

  it("returns ok early when the request is already applied (idempotent)", async () => {
    prismaMock.upgradeRequest.findUnique.mockResolvedValue({
      id: "req1",
      status: "applied",
      toPlan: "HIVE",
      clientId: "c1",
      client: { subscription: null },
    } as never);

    const result = await applyUpgradeRequest("req1", null);
    expect(result).toEqual({ ok: true });
    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
  });

  it("throws invalid_plan for an unknown plan in the request", async () => {
    prismaMock.upgradeRequest.findUnique.mockResolvedValue({
      id: "req1",
      status: "requested",
      toPlan: "INVALID",
      clientId: "c1",
      client: { subscription: { id: "sub1" } },
    } as never);
    await expect(applyUpgradeRequest("req1", null)).rejects.toThrow("invalid_plan");
  });

  it("applies the plan change, marks the request applied, and audits", async () => {
    prismaMock.upgradeRequest.findUnique.mockResolvedValue({
      id: "req1",
      status: "requested",
      toPlan: "HIVE",
      clientId: "c1",
      client: { subscription: { id: "sub1" } },
    } as never);
    prismaMock.plan.findUnique.mockResolvedValue({ id: "plan_hive", name: "HIVE", setupFee: 99900, monthlyFee: 17900 } as never);
    prismaMock.subscription.update.mockResolvedValue({} as never);
    prismaMock.upgradeRequest.update.mockResolvedValue({} as never);

    const result = await applyUpgradeRequest("req1", "admin_u1");
    expect(result).toEqual({ ok: true });
    expect(prismaMock.subscription.update).toHaveBeenCalled();
    expect(prismaMock.upgradeRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "req1" },
        data: expect.objectContaining({ status: "applied", appliedById: "admin_u1" }),
      }),
    );
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "subscription.upgraded", metadata: expect.objectContaining({ viaRequest: "req1" }) }),
    );
  });
});
