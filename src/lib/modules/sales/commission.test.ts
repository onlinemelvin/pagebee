import { describe, it, expect } from "vitest";
import { computeCommission, DEFAULT_COMMISSION_BASES } from "./commission";

describe("computeCommission", () => {
  it("pays the full plan base when there is no discount", () => {
    const r = computeCommission({ plan: "HONEY", listedSetupFeeCents: 69900, collectedSetupFeeCents: 69900 });
    expect(r.base).toBe(200);
    expect(r.amount).toBe(200);
    expect(r.discountCents).toBe(0);
    expect(r.reducedFraction).toBe(0);
  });

  it("uses the per-plan base for each plan", () => {
    expect(computeCommission({ plan: "NECTAR", listedSetupFeeCents: 39900, collectedSetupFeeCents: 39900 }).amount).toBe(60);
    expect(computeCommission({ plan: "HIVE", listedSetupFeeCents: 99900, collectedSetupFeeCents: 99900 }).amount).toBe(500);
  });

  it("pays full base for a discount within the $50 allowance", () => {
    // $40 off Honey → still full base
    const r = computeCommission({ plan: "HONEY", listedSetupFeeCents: 69900, collectedSetupFeeCents: 65900 });
    expect(r.discountCents).toBe(4000);
    expect(r.amount).toBe(200);
    expect(r.reducedFraction).toBe(0);
  });

  it("reduces the base proportionally for discounts beyond the allowance", () => {
    // Honey listed $699, collected $599 (rep floor) → $100 off = ~14.31% → keep ~85.69% of $200
    const r = computeCommission({ plan: "HONEY", listedSetupFeeCents: 69900, collectedSetupFeeCents: 59900 });
    expect(r.discountCents).toBe(10000);
    expect(r.amount).toBe(171.39); // 200 * (1 - 10000/69900)
    expect(r.reducedFraction).toBeGreaterThan(0);
  });

  it("floors the reduction at 50% of base for a waived setup fee", () => {
    const r = computeCommission({ plan: "HIVE", listedSetupFeeCents: 99900, collectedSetupFeeCents: 0 });
    expect(r.amount).toBe(500 * 0.5);
    expect(r.reducedFraction).toBe(0.5);
  });

  it("respects custom bases from a CommissionPlan", () => {
    const r = computeCommission({
      plan: "NECTAR",
      bases: { ...DEFAULT_COMMISSION_BASES, nectar: 80 },
      listedSetupFeeCents: 39900,
      collectedSetupFeeCents: 39900,
    });
    expect(r.amount).toBe(80);
  });
});
