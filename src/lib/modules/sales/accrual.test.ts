import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));

import {
  accrueCommissionForClient,
  runCommissionEligibilitySweep,
  clawbackClientCommissions,
} from "./accrual";

const PLAN = { id: "plan1", nectarBase: 60, honeyBase: 110, hiveBase: 185, clawbackDays: 30 };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("accrueCommissionForClient", () => {
  it("accrues a PENDING setup-fee commission, attributed via the source quote", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      subscription: {
        setupFeePaid: true,
        setupFeePaidAt: new Date("2026-06-01T00:00:00Z"),
        agreedSetupFee: 69900,
        plan: { name: "HONEY", setupFee: 69900 },
      },
      sourceQuote: { salesRepId: "rep1" },
      prospect: null,
    });
    prismaMock.commissionRecord.findFirst.mockResolvedValue(null);
    prismaMock.commissionPlan.findFirst.mockResolvedValue(PLAN);
    prismaMock.commissionRecord.create.mockResolvedValue({ id: "cr1" });

    const res = await accrueCommissionForClient("c1");
    expect(res).toMatchObject({ accrued: true, recordId: "cr1", amount: 110 });
    const data = prismaMock.commissionRecord.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      planId: "plan1",
      employeeId: "rep1",
      clientId: "c1",
      status: "PENDING",
      basis: "setup_fee",
      amount: 110,
    });
    // eligibleAt = paidAt + 30 days
    expect(data.eligibleAt.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("reduces commission when the setup fee was discounted past the allowance", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      subscription: { setupFeePaid: true, setupFeePaidAt: new Date(), agreedSetupFee: 59900, plan: { name: "HONEY", setupFee: 69900 } },
      sourceQuote: { salesRepId: "rep1" },
      prospect: null,
    });
    prismaMock.commissionRecord.findFirst.mockResolvedValue(null);
    prismaMock.commissionPlan.findFirst.mockResolvedValue(PLAN);
    prismaMock.commissionRecord.create.mockResolvedValue({ id: "cr1" });

    const res = await accrueCommissionForClient("c1");
    expect(res.amount).toBe(94.26); // 110 * (1 - 10000/69900)
  });

  it("falls back to the prospect's first-touch rep when there's no source quote", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      subscription: { setupFeePaid: true, setupFeePaidAt: new Date(), agreedSetupFee: 39900, plan: { name: "NECTAR", setupFee: 39900 } },
      sourceQuote: null,
      prospect: { assignments: [{ employeeId: "rep9" }] },
    });
    prismaMock.commissionRecord.findFirst.mockResolvedValue(null);
    prismaMock.commissionPlan.findFirst.mockResolvedValue(PLAN);
    prismaMock.commissionRecord.create.mockResolvedValue({ id: "cr1" });

    await accrueCommissionForClient("c1");
    expect(prismaMock.commissionRecord.create.mock.calls[0][0].data.employeeId).toBe("rep9");
  });

  it("no-op when the client isn't rep-attributed", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      subscription: { setupFeePaid: true, setupFeePaidAt: new Date(), agreedSetupFee: 39900, plan: { name: "NECTAR", setupFee: 39900 } },
      sourceQuote: null,
      prospect: null,
    });
    const res = await accrueCommissionForClient("c1");
    expect(res).toEqual({ accrued: false, reason: "no_attribution_or_unpaid" });
    expect(prismaMock.commissionRecord.create).not.toHaveBeenCalled();
  });

  it("no-op when the setup fee isn't paid", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      subscription: { setupFeePaid: false, plan: { name: "NECTAR", setupFee: 39900 }, agreedSetupFee: 39900 },
      sourceQuote: { salesRepId: "rep1" },
      prospect: null,
    });
    const res = await accrueCommissionForClient("c1");
    expect(res.accrued).toBe(false);
  });

  it("is idempotent — skips when a setup_fee record already exists", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      subscription: { setupFeePaid: true, setupFeePaidAt: new Date(), agreedSetupFee: 39900, plan: { name: "NECTAR", setupFee: 39900 } },
      sourceQuote: { salesRepId: "rep1" },
      prospect: null,
    });
    prismaMock.commissionRecord.findFirst.mockResolvedValue({ id: "existing" });
    const res = await accrueCommissionForClient("c1");
    expect(res).toEqual({ accrued: false, reason: "already_accrued" });
    expect(prismaMock.commissionRecord.create).not.toHaveBeenCalled();
  });
});

describe("runCommissionEligibilitySweep", () => {
  it("makes records ELIGIBLE for active clients and CLAWED_BACK for cancelled ones", async () => {
    prismaMock.commissionRecord.findMany.mockResolvedValue([
      { id: "r1", clientId: "active" },
      { id: "r2", clientId: "cancelled" },
      { id: "r3", clientId: "pastdue" },
    ]);
    prismaMock.subscription.findUnique.mockImplementation(async ({ where }: { where: { clientId: string } }) => {
      const map: Record<string, string> = { active: "ACTIVE", cancelled: "CANCELLED", pastdue: "PAST_DUE" };
      return { status: map[where.clientId] };
    });
    prismaMock.commissionRecord.update.mockResolvedValue({});

    const now = new Date("2026-07-05T00:00:00Z");
    const res = await runCommissionEligibilitySweep(now);
    expect(res).toEqual({ eligible: 1, clawedBack: 1, scanned: 3 });
    expect(prismaMock.commissionRecord.update).toHaveBeenCalledWith({ where: { id: "r1" }, data: { status: "ELIGIBLE", eligibleAt: now } });
    expect(prismaMock.commissionRecord.update).toHaveBeenCalledWith({ where: { id: "r2" }, data: { status: "CLAWED_BACK", clawedBackAt: now } });
    // pastdue left untouched (only 2 updates)
    expect(prismaMock.commissionRecord.update).toHaveBeenCalledTimes(2);
  });
});

describe("clawbackClientCommissions", () => {
  it("reverses unpaid records and flags paid ones", async () => {
    prismaMock.commissionRecord.updateMany.mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 1 });
    const res = await clawbackClientCommissions("c1");
    expect(res).toEqual({ reversed: 2, flaggedPaid: 1 });
  });
});
