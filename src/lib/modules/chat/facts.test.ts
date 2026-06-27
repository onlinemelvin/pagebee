import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

// The curated knowledge-base context is owned by the knowledge module; mock it so
// these tests cover facts.ts's OWN assembly logic, not the KB internals.
vi.mock("@/lib/modules/knowledge", () => ({ buildKbContext: vi.fn() }));

import { loadBusinessFacts } from "./facts";
import { buildKbContext } from "@/lib/modules/knowledge";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(buildKbContext).mockResolvedValue("");
});

describe("loadBusinessFacts", () => {
  it("assembles facts from client, kb, and services", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      businessName: "Acme Plumbing",
      businessType: "Plumbing",
      ownerPhone: "+15551234567",
      ownerEmail: "owner@acme.com",
    });
    vi.mocked(buildKbContext).mockResolvedValue("Hours: 9-5");
    prismaMock.service.findMany.mockResolvedValue([
      { title: "Drain Cleaning", description: null, durationMinutes: 60, price: 8900 },
      { title: "Free Estimate", description: null, durationMinutes: 30, price: null },
    ]);

    const result = await loadBusinessFacts("c1");

    expect(result.businessName).toBe("Acme Plumbing");
    expect(result.businessType).toBe("Plumbing");
    expect(result.phone).toBe("+15551234567");
    expect(result.email).toBe("owner@acme.com");
    expect(result.facts).toContain("Business: Acme Plumbing (Plumbing)");
    expect(result.facts).toContain("Contact email: owner@acme.com");
    expect(result.facts).toContain("Contact phone: +15551234567");
    const servicesFact = result.facts.find((f) => f.startsWith("Services:")) ?? "";
    // price 8900 cents → toFixed(0) → "89"
    expect(servicesFact).toContain("Drain Cleaning ($89)");
    expect(servicesFact).toContain("Free Estimate");
    // Free Estimate has null price so no dollar amount should appear for it
    expect(servicesFact.includes("Free Estimate ($")).toBe(false);
    // The KB context, when present, is appended as a single fact line.
    expect(result.facts.some((f) => f.startsWith("Knowledge base") && f.includes("Hours: 9-5"))).toBe(true);
  });

  it("falls back to 'this business' when client is not found", async () => {
    prismaMock.client.findUnique.mockResolvedValue(null);
    prismaMock.service.findMany.mockResolvedValue([]);

    const result = await loadBusinessFacts("c1");

    expect(result.businessName).toBe("this business");
    expect(result.businessType).toBeNull();
    expect(result.phone).toBeNull();
    expect(result.email).toBeNull();
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]).toContain("this business");
  });

  it("omits email and phone lines when not set", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      businessName: "Hair Salon",
      businessType: null,
      ownerPhone: null,
      ownerEmail: null,
    });
    prismaMock.service.findMany.mockResolvedValue([]);

    const result = await loadBusinessFacts("c1");

    expect(result.facts.some((f) => f.startsWith("Contact email:"))).toBe(false);
    expect(result.facts.some((f) => f.startsWith("Contact phone:"))).toBe(false);
  });

  it("omits services line when none are on-website", async () => {
    prismaMock.client.findUnique.mockResolvedValue({ businessName: "B", businessType: null, ownerPhone: null, ownerEmail: null });
    prismaMock.service.findMany.mockResolvedValue([]);

    const result = await loadBusinessFacts("c1");

    expect(result.facts.some((f) => f.startsWith("Services:"))).toBe(false);
  });

  it("omits the knowledge-base line when the KB context is empty", async () => {
    prismaMock.client.findUnique.mockResolvedValue({ businessName: "B", businessType: null, ownerPhone: null, ownerEmail: null });
    vi.mocked(buildKbContext).mockResolvedValue("");
    prismaMock.service.findMany.mockResolvedValue([]);

    const result = await loadBusinessFacts("c1");

    expect(result.facts.some((f) => f.startsWith("Knowledge base"))).toBe(false);
  });

  it("scopes service query by clientId and builds KB context for that tenant", async () => {
    prismaMock.client.findUnique.mockResolvedValue({ businessName: "B", businessType: null, ownerPhone: null, ownerEmail: null });
    prismaMock.service.findMany.mockResolvedValue([]);

    await loadBusinessFacts("tenant-x");

    expect(prismaMock.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ clientId: "tenant-x", showOnWebsite: true }) }),
    );
    expect(buildKbContext).toHaveBeenCalledWith("tenant-x");
  });
});
