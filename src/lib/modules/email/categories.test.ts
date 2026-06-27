import { describe, it, expect } from "vitest";
import { isMarketing, CATEGORY_LABELS, MARKETING_CATEGORIES } from "./categories";

describe("isMarketing", () => {
  it("returns true for marketing categories", () => {
    for (const cat of MARKETING_CATEGORIES) {
      expect(isMarketing(cat)).toBe(true);
    }
  });

  it("returns false for transactional categories", () => {
    const transactional = ["WELCOME", "AUTH", "BILLING", "WEBSITE", "USAGE", "ACCOUNT"] as const;
    for (const cat of transactional) {
      expect(isMarketing(cat)).toBe(false);
    }
  });

  it("returns false for CUSTOMER_* non-marketing categories", () => {
    const customerTransactional = ["CUSTOMER_INQUIRY", "CUSTOMER_APPOINTMENT", "CUSTOMER_BILLING", "CUSTOMER_REVIEW"] as const;
    for (const cat of customerTransactional) {
      expect(isMarketing(cat)).toBe(false);
    }
  });
});

describe("CATEGORY_LABELS", () => {
  it("has a label for every known category", () => {
    const allCats = [
      "WELCOME", "AUTH", "BILLING", "WEBSITE", "USAGE", "ACCOUNT",
      "TIPS", "ANNOUNCEMENT", "PROMOTION",
      "CUSTOMER_INQUIRY", "CUSTOMER_APPOINTMENT", "CUSTOMER_BILLING",
      "CUSTOMER_REVIEW", "CUSTOMER_MARKETING",
    ];
    for (const cat of allCats) {
      expect(CATEGORY_LABELS[cat as never]).toBeTruthy();
    }
  });
});
