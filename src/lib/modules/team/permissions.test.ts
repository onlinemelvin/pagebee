import { describe, it, expect } from "vitest";

import {
  TEAM_AREAS,
  TEAM_AREA_KEYS,
  areasForFlags,
  permKey,
  levelToKeys,
  keysToLevel,
  canView,
  canManage,
  permissionsFromLevels,
  sanitizePermissions,
  areaForNavKey,
} from "./permissions";

describe("permKey", () => {
  it("composes area and action into a colon-separated key", () => {
    expect(permKey("finance", "view")).toBe("finance:view");
    expect(permKey("finance", "manage")).toBe("finance:manage");
  });
});

describe("levelToKeys", () => {
  it("returns empty array for level none", () => {
    expect(levelToKeys("finance", "none")).toEqual([]);
  });

  it("returns only view key for level view", () => {
    expect(levelToKeys("finance", "view")).toEqual(["finance:view"]);
  });

  it("returns both view and manage keys for level manage", () => {
    const keys = levelToKeys("finance", "manage");
    expect(keys).toContain("finance:view");
    expect(keys).toContain("finance:manage");
    expect(keys).toHaveLength(2);
  });
});

describe("keysToLevel", () => {
  it("returns none when no matching keys", () => {
    expect(keysToLevel([], "finance")).toBe("none");
    expect(keysToLevel(["inquiries:view"], "finance")).toBe("none");
  });

  it("returns view when only view key present", () => {
    expect(keysToLevel(["finance:view"], "finance")).toBe("view");
  });

  it("returns manage when manage key present (even without explicit view)", () => {
    expect(keysToLevel(["finance:manage"], "finance")).toBe("manage");
  });

  it("returns manage when both view and manage keys present", () => {
    expect(keysToLevel(["finance:view", "finance:manage"], "finance")).toBe("manage");
  });
});

describe("canView", () => {
  it("owners can always view any area", () => {
    expect(canView("owner", [], "finance")).toBe(true);
    expect(canView("owner", [], "inquiries")).toBe(true);
  });

  it("staff with view key for the area can view", () => {
    expect(canView("staff", ["finance:view"], "finance")).toBe(true);
  });

  it("staff with manage key for the area can view (manage implies view)", () => {
    expect(canView("staff", ["finance:manage"], "finance")).toBe(true);
  });

  it("staff without any relevant key cannot view", () => {
    expect(canView("staff", [], "finance")).toBe(false);
    expect(canView("staff", ["inquiries:view"], "finance")).toBe(false);
  });

  it("staff with a different area's manage key cannot view this area", () => {
    expect(canView("staff", ["inquiries:manage"], "finance")).toBe(false);
  });
});

describe("canManage", () => {
  it("owners can always manage any area", () => {
    expect(canManage("owner", [], "finance")).toBe(true);
  });

  it("staff with manage key can manage", () => {
    expect(canManage("staff", ["finance:manage"], "finance")).toBe(true);
  });

  it("staff with only view key cannot manage", () => {
    expect(canManage("staff", ["finance:view"], "finance")).toBe(false);
  });

  it("staff with no keys cannot manage", () => {
    expect(canManage("staff", [], "finance")).toBe(false);
  });
});

describe("areasForFlags", () => {
  it("always includes areas with null flag", () => {
    const areas = areasForFlags({});
    const nullFlagAreas = TEAM_AREAS.filter((a) => a.flag === null);
    for (const a of nullFlagAreas) {
      expect(areas.find((x) => x.key === a.key)).toBeDefined();
    }
  });

  it("excludes flag-gated areas when the flag is missing", () => {
    const areas = areasForFlags({}); // no flags enabled
    const gatedAreas = TEAM_AREAS.filter((a) => a.flag !== null);
    for (const a of gatedAreas) {
      expect(areas.find((x) => x.key === a.key)).toBeUndefined();
    }
  });

  it("includes flag-gated areas when their flag is enabled", () => {
    const financeArea = TEAM_AREAS.find((a) => a.key === "finance")!;
    const areas = areasForFlags({ [financeArea.flag!]: true });
    expect(areas.find((a) => a.key === "finance")).toBeDefined();
  });

  it("excludes finance when its flag is false", () => {
    const financeArea = TEAM_AREAS.find((a) => a.key === "finance")!;
    const areas = areasForFlags({ [financeArea.flag!]: false });
    expect(areas.find((a) => a.key === "finance")).toBeUndefined();
  });
});

describe("permissionsFromLevels", () => {
  it("returns empty array when all areas are none", () => {
    expect(permissionsFromLevels({})).toEqual([]);
  });

  it("expands manage to view+manage keys for the given area", () => {
    const result = permissionsFromLevels({ finance: "manage" });
    expect(result).toContain("finance:view");
    expect(result).toContain("finance:manage");
  });

  it("expands view to only the view key", () => {
    const result = permissionsFromLevels({ finance: "view" });
    expect(result).toContain("finance:view");
    expect(result).not.toContain("finance:manage");
  });

  it("only emits keys for areas in TEAM_AREAS (unknown area entries are ignored)", () => {
    const result = permissionsFromLevels({ unknown_area: "manage" } as never);
    expect(result).toHaveLength(0);
  });

  it("handles multiple areas simultaneously", () => {
    const result = permissionsFromLevels({ finance: "view", inquiries: "manage" });
    expect(result).toContain("finance:view");
    expect(result).not.toContain("finance:manage");
    expect(result).toContain("inquiries:view");
    expect(result).toContain("inquiries:manage");
  });
});

describe("sanitizePermissions", () => {
  it("drops unknown permission keys", () => {
    const result = sanitizePermissions(["unknown:manage", "fake:view"]);
    expect(result).toHaveLength(0);
  });

  it("keeps valid keys", () => {
    const result = sanitizePermissions(["finance:view"]);
    expect(result).toContain("finance:view");
  });

  it("adds view when only manage is provided (manage implies view)", () => {
    const result = sanitizePermissions(["finance:manage"]);
    expect(result).toContain("finance:view");
    expect(result).toContain("finance:manage");
  });

  it("handles a mix of valid and invalid keys", () => {
    const result = sanitizePermissions(["finance:manage", "totally:fake"]);
    expect(result).toContain("finance:manage");
    expect(result).toContain("finance:view");
    expect(result).not.toContain("totally:fake");
  });

  it("is idempotent — running twice produces the same set", () => {
    const once = sanitizePermissions(["inquiries:manage"]);
    const twice = sanitizePermissions(once);
    expect(new Set(once)).toEqual(new Set(twice));
  });
});

describe("areaForNavKey", () => {
  it("returns the area that governs a known nav key", () => {
    const area = areaForNavKey("invoices");
    expect(area?.key).toBe("finance");
  });

  it("returns the inquiries area for the chats nav key", () => {
    const area = areaForNavKey("chats");
    expect(area?.key).toBe("inquiries");
  });

  it("returns undefined for an unknown nav key", () => {
    expect(areaForNavKey("nonexistent")).toBeUndefined();
  });

  it("returns undefined for overview (not governed by any team area)", () => {
    expect(areaForNavKey("overview")).toBeUndefined();
  });
});

describe("TEAM_AREA_KEYS", () => {
  it("contains the key for every defined TEAM_AREA", () => {
    for (const area of TEAM_AREAS) {
      expect(TEAM_AREA_KEYS).toContain(area.key);
    }
  });
});
