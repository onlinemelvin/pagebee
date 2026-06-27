import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/ai/service-meta", () => ({
  generateServiceMeta: vi.fn().mockResolvedValue({ icon: "scissors", description: "A test service." }),
  uniqueIcon: vi.fn().mockImplementation((desired: string) => desired),
}));

import {
  listServices,
  listBookableServices,
  listWebsiteServices,
  getServiceDurations,
  createService,
  updateService,
  deleteService,
  ensureDefaultServices,
  getServiceDisplay,
  setServiceDisplay,
  seedServicesFromNames,
  serviceDurationLabel,
  OTHER_TITLE,
} from "./service";
import { writeAudit } from "@/lib/modules/audit";
import { generateServiceMeta, uniqueIcon } from "@/lib/ai/service-meta";

beforeEach(() => {
  vi.clearAllMocks();
  // vi.resetAllMocks() in setup.ts clears implementations — restore them here.
  vi.mocked(generateServiceMeta).mockResolvedValue({ icon: "scissors", description: "A test service." });
  vi.mocked(uniqueIcon).mockImplementation((desired: string) => desired);
});

// ── helpers ───────────────────────────────────────────────────────────────────

const NOW = new Date("2026-07-01T00:00:00Z");

function makeService(overrides: Record<string, unknown> = {}) {
  return {
    id: "svc1",
    clientId: "c1",
    title: "Haircut",
    description: "A clean cut.",
    icon: "scissors",
    durationMinutes: 60,
    price: null,
    showOnWebsite: true,
    isDefault: false,
    sortOrder: 0,
    active: true,
    createdAt: NOW,
    ...overrides,
  };
}

function makeOtherService() {
  return makeService({
    id: "svc-other",
    title: OTHER_TITLE,
    isDefault: true,
    showOnWebsite: false,
    sortOrder: 9999,
  });
}

// ── serviceDurationLabel (pure helper) ───────────────────────────────────────

describe("serviceDurationLabel", () => {
  it("formats exact days", () => {
    expect(serviceDurationLabel(1440)).toBe("1 day");
    expect(serviceDurationLabel(2880)).toBe("2 days");
  });

  it("formats exact hours", () => {
    expect(serviceDurationLabel(60)).toBe("1 hour");
    expect(serviceDurationLabel(120)).toBe("2 hours");
  });

  it("formats minutes for non-round values", () => {
    expect(serviceDurationLabel(30)).toBe("30 min");
    expect(serviceDurationLabel(90)).toBe("90 min");
  });

  it("formats 45 minutes as '45 min'", () => {
    expect(serviceDurationLabel(45)).toBe("45 min");
  });
});

// ── ensureDefaultServices ─────────────────────────────────────────────────────

describe("ensureDefaultServices", () => {
  it("creates the 'Other' default when it does not exist", async () => {
    prismaMock.service.findFirst.mockResolvedValue(null); // no default yet
    prismaMock.service.create.mockResolvedValue(makeOtherService() as never);

    await ensureDefaultServices("c1");
    expect(prismaMock.service.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: OTHER_TITLE, isDefault: true, clientId: "c1" }),
      }),
    );
  });

  it("is idempotent — does not create a second default when one already exists", async () => {
    prismaMock.service.findFirst.mockResolvedValue(makeOtherService() as never);

    await ensureDefaultServices("c1");
    expect(prismaMock.service.create).not.toHaveBeenCalled();
  });
});

// ── listServices ──────────────────────────────────────────────────────────────

describe("listServices", () => {
  it("calls ensureDefaultServices then returns all services scoped to client", async () => {
    prismaMock.service.findFirst.mockResolvedValue(makeOtherService() as never); // default exists
    prismaMock.service.findMany.mockResolvedValue([makeService(), makeOtherService()] as never);

    const result = await listServices("c1");
    expect(prismaMock.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: "c1" } }),
    );
    expect(result).toHaveLength(2);
  });

  it("maps to DTO correctly", async () => {
    prismaMock.service.findFirst.mockResolvedValue(makeOtherService() as never);
    prismaMock.service.findMany.mockResolvedValue([makeService()] as never);
    const [dto] = await listServices("c1");
    expect(dto.id).toBe("svc1");
    expect(dto.title).toBe("Haircut");
    expect(dto.active).toBe(true);
  });
});

// ── listBookableServices ──────────────────────────────────────────────────────

describe("listBookableServices", () => {
  it("only returns active services", async () => {
    prismaMock.service.findFirst.mockResolvedValue(makeOtherService() as never);
    prismaMock.service.findMany.mockResolvedValue([makeService()] as never);

    await listBookableServices("c1");
    expect(prismaMock.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: "c1", active: true } }),
    );
  });
});

// ── listWebsiteServices ───────────────────────────────────────────────────────

describe("listWebsiteServices", () => {
  it("filters to active + showOnWebsite + not isDefault", async () => {
    prismaMock.service.findMany.mockResolvedValue([]);
    await listWebsiteServices("c1");
    expect(prismaMock.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clientId: "c1", active: true, showOnWebsite: true, isDefault: false },
      }),
    );
  });
});

// ── getServiceDurations ───────────────────────────────────────────────────────

describe("getServiceDurations", () => {
  it("returns a Map of title → durationMinutes", async () => {
    prismaMock.service.findMany.mockResolvedValue([
      { title: "Haircut", durationMinutes: 45 },
      { title: "Color", durationMinutes: 120 },
    ] as never);
    const map = await getServiceDurations("c1");
    expect(map.get("Haircut")).toBe(45);
    expect(map.get("Color")).toBe(120);
  });

  it("scopes to the correct clientId", async () => {
    prismaMock.service.findMany.mockResolvedValue([]);
    await getServiceDurations("c99");
    expect(prismaMock.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: "c99", active: true } }),
    );
  });
});

// ── createService ─────────────────────────────────────────────────────────────

describe("createService", () => {
  function setupCreate() {
    prismaMock.client.findUnique.mockResolvedValue({ businessName: "Best Salon", businessType: "salon" } as never);
    // First findMany call is for existing icons (used in createService), second may be from ensureDefaultServices.
    prismaMock.service.findMany.mockResolvedValue([]); // no existing icons
    prismaMock.service.findFirst.mockResolvedValue(makeOtherService() as never); // default already exists
    prismaMock.service.create.mockResolvedValue(makeService() as never);
  }

  it("creates a service scoped to the tenant and audits", async () => {
    setupCreate();
    const result = await createService("c1", { title: "Haircut", durationMinutes: 45, showOnWebsite: true });
    expect(prismaMock.service.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ clientId: "c1", title: "Haircut" }) }),
    );
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "service.created", clientId: "c1" }),
    );
    expect(result.id).toBe("svc1");
  });

  it("throws ZodError for invalid input", async () => {
    await expect(createService("c1", { title: "" })).rejects.toThrow();
    expect(prismaMock.service.create).not.toHaveBeenCalled();
  });

  it("uses AI-generated icon when none is supplied", async () => {
    setupCreate();
    await createService("c1", { title: "Color Treatment", durationMinutes: 90, showOnWebsite: true });
    // generateServiceMeta is called; uniqueIcon returns "scissors"
    expect(prismaMock.service.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ icon: "scissors" }) }),
    );
  });

  it("stores null price when not supplied", async () => {
    setupCreate();
    await createService("c1", { title: "Haircut", durationMinutes: 45, showOnWebsite: false });
    expect(prismaMock.service.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ price: null }) }),
    );
  });
});

// ── updateService ─────────────────────────────────────────────────────────────

describe("updateService", () => {
  it("throws ServiceError(404, not_found) for wrong tenant", async () => {
    prismaMock.service.findFirst.mockResolvedValue(null);
    await expect(updateService("c1", "svc1", { durationMinutes: 30 })).rejects.toThrow("not_found");
    expect(prismaMock.service.update).not.toHaveBeenCalled();
  });

  it("updates and audits when owned", async () => {
    prismaMock.service.findFirst.mockResolvedValue(makeService() as never);
    prismaMock.service.update.mockResolvedValue(makeService({ durationMinutes: 30 }) as never);

    const result = await updateService("c1", "svc1", { durationMinutes: 30 });
    expect(prismaMock.service.update).toHaveBeenCalled();
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "service.updated", clientId: "c1" }),
    );
    expect(result.durationMinutes).toBe(30);
  });

  it("ignores title and showOnWebsite updates for the 'Other' default service", async () => {
    prismaMock.service.findFirst.mockResolvedValue(makeOtherService() as never);
    prismaMock.service.update.mockResolvedValue(makeOtherService() as never);

    await updateService("c1", "svc-other", { title: "New Title", showOnWebsite: true, durationMinutes: 90 });
    const updateCall = prismaMock.service.update.mock.calls[0][0];
    // title and showOnWebsite should be stripped (undefined) for default services
    expect(updateCall.data.title).toBeUndefined();
    expect(updateCall.data.showOnWebsite).toBeUndefined();
  });
});

// ── deleteService ─────────────────────────────────────────────────────────────

describe("deleteService", () => {
  it("throws ServiceError(404, not_found) for wrong tenant", async () => {
    prismaMock.service.findFirst.mockResolvedValue(null);
    await expect(deleteService("c1", "svc1")).rejects.toThrow("not_found");
    expect(prismaMock.service.delete).not.toHaveBeenCalled();
  });

  it("throws ServiceError(400, cannot_delete_default) for the 'Other' catch-all", async () => {
    prismaMock.service.findFirst.mockResolvedValue(makeOtherService() as never);
    await expect(deleteService("c1", "svc-other")).rejects.toThrow("cannot_delete_default");
    expect(prismaMock.service.delete).not.toHaveBeenCalled();
  });

  it("deletes and audits for a regular service", async () => {
    prismaMock.service.findFirst.mockResolvedValue(makeService() as never);
    prismaMock.service.delete.mockResolvedValue({} as never);

    const result = await deleteService("c1", "svc1");
    expect(result).toEqual({ id: "svc1" });
    expect(prismaMock.service.delete).toHaveBeenCalledWith({ where: { id: "svc1" } });
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "service.deleted" }));
  });
});

// ── getServiceDisplay / setServiceDisplay ─────────────────────────────────────

describe("getServiceDisplay", () => {
  it("returns false for both when no flags are set", async () => {
    prismaMock.featureFlag.findMany.mockResolvedValue([]);
    const result = await getServiceDisplay("c1");
    expect(result).toEqual({ showPrice: false, showDuration: false });
  });

  it("returns true for showPrice when the flag is enabled", async () => {
    prismaMock.featureFlag.findMany.mockResolvedValue([
      { key: "service_show_price", enabled: true },
    ] as never);
    const result = await getServiceDisplay("c1");
    expect(result.showPrice).toBe(true);
    expect(result.showDuration).toBe(false);
  });

  it("returns true for both when both flags are enabled", async () => {
    prismaMock.featureFlag.findMany.mockResolvedValue([
      { key: "service_show_price", enabled: true },
      { key: "service_show_duration", enabled: true },
    ] as never);
    const result = await getServiceDisplay("c1");
    expect(result).toEqual({ showPrice: true, showDuration: true });
  });
});

describe("setServiceDisplay", () => {
  it("upserts the showPrice flag and audits", async () => {
    prismaMock.featureFlag.upsert.mockResolvedValue({} as never);
    prismaMock.featureFlag.findMany.mockResolvedValue([
      { key: "service_show_price", enabled: true },
    ] as never);
    const result = await setServiceDisplay("c1", { showPrice: true });
    expect(prismaMock.featureFlag.upsert).toHaveBeenCalledTimes(1);
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "service.display_updated", clientId: "c1" }),
    );
    expect(result.showPrice).toBe(true);
  });

  it("upserts both flags when both are provided", async () => {
    prismaMock.featureFlag.upsert.mockResolvedValue({} as never);
    prismaMock.featureFlag.findMany.mockResolvedValue([]);
    await setServiceDisplay("c1", { showPrice: false, showDuration: true });
    expect(prismaMock.featureFlag.upsert).toHaveBeenCalledTimes(2);
  });

  it("skips upsert for fields not included in the patch", async () => {
    prismaMock.featureFlag.upsert.mockResolvedValue({} as never);
    prismaMock.featureFlag.findMany.mockResolvedValue([]);
    await setServiceDisplay("c1", {}); // empty patch
    expect(prismaMock.featureFlag.upsert).not.toHaveBeenCalled();
  });
});

// ── seedServicesFromNames ─────────────────────────────────────────────────────

describe("seedServicesFromNames", () => {
  function setupSeed() {
    // ensureDefaultServices chain
    prismaMock.service.findFirst.mockResolvedValue(makeOtherService() as never);
    prismaMock.service.count.mockResolvedValue(0); // no real services yet
    prismaMock.client.findUnique.mockResolvedValue({ businessName: "Salon", businessType: null } as never);
    prismaMock.service.createMany.mockResolvedValue({ count: 2 });
  }

  it("creates services from names when catalog is empty", async () => {
    setupSeed();
    await seedServicesFromNames("c1", ["Haircut", "Color"]);
    expect(prismaMock.service.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ title: "Haircut", clientId: "c1", showOnWebsite: true }),
          expect.objectContaining({ title: "Color", clientId: "c1" }),
        ]),
      }),
    );
  });

  it("skips seeding when real services already exist", async () => {
    prismaMock.service.findFirst.mockResolvedValue(makeOtherService() as never);
    prismaMock.service.count.mockResolvedValue(3); // already has services
    await seedServicesFromNames("c1", ["Haircut"]);
    expect(prismaMock.service.createMany).not.toHaveBeenCalled();
  });

  it("deduplicates and trims names", async () => {
    setupSeed();
    await seedServicesFromNames("c1", ["Haircut", "  Haircut  ", "Color"]);
    const call = prismaMock.service.createMany.mock.calls[0][0];
    const titles = (call.data as Array<{ title: string }>).map((d) => d.title);
    // "Haircut" appears only once after dedup+trim
    expect(titles.filter((t) => t === "Haircut")).toHaveLength(1);
  });

  it("is a no-op for an empty names array", async () => {
    prismaMock.service.findFirst.mockResolvedValue(makeOtherService() as never);
    prismaMock.service.count.mockResolvedValue(0);
    await seedServicesFromNames("c1", []);
    expect(prismaMock.service.createMany).not.toHaveBeenCalled();
  });
});
