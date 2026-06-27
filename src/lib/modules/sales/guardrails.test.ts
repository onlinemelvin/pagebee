import { describe, it, expect } from "vitest";
import { evaluateGuardrails } from "./guardrails";

const honey = { plan: "HONEY" as const, listedSetupCents: 69900, listedMonthlyCents: 8900 };

describe("evaluateGuardrails", () => {
  it("no approval at full price", () => {
    const r = evaluateGuardrails({ ...honey, offeredSetupCents: 69900, offeredMonthlyCents: 8900 });
    expect(r.requiresApproval).toBe(false);
    expect(r.reasons).toEqual([]);
  });

  it("no approval for a setup discount down to the floor", () => {
    const r = evaluateGuardrails({ ...honey, offeredSetupCents: 59900, offeredMonthlyCents: 8900 });
    expect(r.requiresApproval).toBe(false);
    expect(r.setupDiscountCents).toBe(10000);
  });

  it("requires approval for setup below the floor", () => {
    const r = evaluateGuardrails({ ...honey, offeredSetupCents: 49900, offeredMonthlyCents: 8900 });
    expect(r.requiresApproval).toBe(true);
    expect(r.reasons).toContain("setup_below_floor");
  });

  it("requires approval for any monthly discount", () => {
    const r = evaluateGuardrails({ ...honey, offeredSetupCents: 69900, offeredMonthlyCents: 8000 });
    expect(r.requiresApproval).toBe(true);
    expect(r.reasons).toContain("monthly_discount");
  });

  it("flags a waived setup fee", () => {
    const r = evaluateGuardrails({ ...honey, offeredSetupCents: 0, offeredMonthlyCents: 8900 });
    expect(r.reasons).toContain("setup_waived");
    expect(r.reasons).not.toContain("setup_below_floor");
  });

  it("flags multiple discounts", () => {
    const r = evaluateGuardrails({ ...honey, offeredSetupCents: 59900, offeredMonthlyCents: 8000 });
    expect(r.reasons).toContain("multiple_discounts");
    expect(r.requiresApproval).toBe(true);
  });
});
