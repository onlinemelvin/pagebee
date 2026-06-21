import { describe, it, expect } from "vitest";
import { formatMoney } from "./money";

// The money-as-integer-cents invariant + currency correctness (regression guard
// for the customer-email USD hard-coding bug fixed in the Tier 2 pass).
describe("formatMoney", () => {
  it("renders USD by default", () => {
    expect(formatMoney(12345)).toBe("$123.45");
  });

  it("honors a non-USD currency (no $ leakage)", () => {
    const eur = formatMoney(12345, "eur");
    expect(eur).toContain("€");
    expect(eur).not.toContain("$");
    expect(formatMoney(5000, "gbp")).toContain("£");
  });

  it("treats the input as integer cents", () => {
    expect(formatMoney(100)).toBe("$1.00");
    expect(formatMoney(1)).toBe("$0.01");
    expect(formatMoney(0)).toBe("$0.00");
  });

  it("uppercases lowercase currency codes", () => {
    expect(formatMoney(100, "usd")).toBe(formatMoney(100, "USD"));
  });
});
