import { describe, it, expect } from "vitest";
import {
  PLANS,
  planByName,
  topPlan,
  tierDiff,
  nextTier,
  planRank,
  setupFeeDelta,
  planForFlag,
  planLimitRows,
} from "./plans";

describe("planByName", () => {
  it("finds a plan by its canonical name", () => {
    expect(planByName("HONEY")?.name).toBe("HONEY");
  });
  it("returns undefined for an unknown name", () => {
    expect(planByName("PLATINUM")).toBeUndefined();
  });
});

describe("topPlan", () => {
  it("is the highest tier (HIVE)", () => {
    expect(topPlan().name).toBe("HIVE");
  });
});

describe("planRank", () => {
  it("orders the tiers ascending", () => {
    expect(planRank("NECTAR")).toBe(0);
    expect(planRank("HONEY")).toBe(1);
    expect(planRank("HIVE")).toBe(2);
  });
  it("returns -1 for an unknown tier", () => {
    expect(planRank("NOPE")).toBe(-1);
  });
});

describe("nextTier", () => {
  it("returns the next higher tier", () => {
    expect(nextTier("NECTAR")?.name).toBe("HONEY");
    expect(nextTier("HONEY")?.name).toBe("HIVE");
  });
  it("returns null at the top tier", () => {
    expect(nextTier("HIVE")).toBeNull();
  });
  it("returns null for an unknown tier", () => {
    expect(nextTier("NOPE")).toBeNull();
  });
});

describe("setupFeeDelta", () => {
  it("charges only the gap when upgrading", () => {
    const nectar = planByName("NECTAR")!;
    const hive = planByName("HIVE")!;
    expect(setupFeeDelta("NECTAR", "HIVE")).toBe(Math.max(0, hive.setupFee - nectar.setupFee));
  });
  it("is zero for a downgrade or same tier", () => {
    expect(setupFeeDelta("HIVE", "NECTAR")).toBe(0);
    expect(setupFeeDelta("HONEY", "HONEY")).toBe(0);
  });
  it("is zero when a plan is unknown", () => {
    expect(setupFeeDelta("NOPE", "HIVE")).toBe(0);
  });
});

describe("tierDiff", () => {
  it("reports an upgrade with gained features and positive deltas", () => {
    const diff = tierDiff("NECTAR", "HIVE");
    expect(diff).not.toBeNull();
    expect(diff!.direction).toBe("upgrade");
    expect(diff!.monthlyDeltaCents).toBeGreaterThan(0);
    expect(diff!.setupDeltaCents).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(diff!.gained)).toBe(true);
  });

  it("reports a downgrade and computes pages over the new limit", () => {
    const to = planByName("NECTAR")!;
    const diff = tierDiff("HIVE", "NECTAR", to.maxPages + 3);
    expect(diff!.direction).toBe("downgrade");
    expect(diff!.pagesOver).toBe(3);
    // Downgrade loses features that HIVE had but NECTAR lacks.
    expect(diff!.lost.length).toBeGreaterThan(0);
  });

  it("reports 'same' for an identical tier", () => {
    expect(tierDiff("HONEY", "HONEY")!.direction).toBe("same");
  });

  it("returns null when a plan name is unknown", () => {
    expect(tierDiff("NOPE", "HIVE")).toBeNull();
  });
});

describe("planForFlag", () => {
  it("returns the cheapest plan enabling a feature flag", () => {
    const plan = planForFlag("contactForm");
    expect(plan).toBeDefined();
    expect(plan!.featureFlags.contactForm).toBe(true);
  });
  it("returns undefined for a flag no plan enables", () => {
    expect(planForFlag("teleportation")).toBeUndefined();
  });
});

describe("planLimitRows", () => {
  it("always lists pages, updates and seats", () => {
    const rows = planLimitRows(planByName("HONEY")!);
    const labels = rows.map((r) => r.label);
    expect(labels).toEqual(expect.arrayContaining(["Pages & sections", "Website updates", "Team members"]));
  });

  it("produces well-formed rows for every plan", () => {
    for (const plan of PLANS) {
      const rows = planLimitRows(plan);
      expect(rows.length).toBeGreaterThanOrEqual(3);
      for (const r of rows) {
        expect(typeof r.label).toBe("string");
        expect(typeof r.value).toBe("string");
      }
    }
  });
});
