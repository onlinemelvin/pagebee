import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/events", () => ({ emit: vi.fn() }));
vi.mock("@/lib/vercel/domains", () => ({
  vercelConfigured: vi.fn(() => false),
  addProjectDomain: vi.fn(),
  VercelError: class VercelError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message);
    }
  },
}));
// vi.hoisted runs BEFORE the vi.mock hoisting, so the object is available inside the factory.
const mockRegistrar = vi.hoisted(() => ({
  configured: vi.fn(() => false),
  lookup: vi.fn(),
  getPrice: vi.fn(),
  buyDomain: vi.fn(),
}));
vi.mock("@/lib/registrar", () => ({
  getRegistrar: vi.fn(() => mockRegistrar),
  RegistrarError: class RegistrarError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message);
    }
  },
}));
vi.mock("@/lib/site/registrar-instructions", () => ({
  getRegistrarGuide: vi.fn(() => null),
}));
// checkCustomDomain + planHosts are pure — we can let them run real in most tests.
// But we need to control them when we want "registrar unavailable" to be the exact path.

import {
  isDomainBuyDryRun,
  lookupDomain,
  requestPurchaseDomain,
  executePurchase,
  getConnectInstructions,
} from "./domain-purchase";
import { RegistrarError } from "@/lib/registrar";
import { writeAudit } from "@/lib/modules/audit";
import { emit } from "@/lib/events";
import { vercelConfigured } from "@/lib/vercel/domains";
import { getRegistrarGuide } from "@/lib/site/registrar-instructions";

const mockVercelConfigured = vercelConfigured as ReturnType<typeof vi.fn>;
const mockGetRegistrarGuide = getRegistrarGuide as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockVercelConfigured.mockReturnValue(false);
  mockRegistrar.configured.mockReturnValue(false);
  // writeAudit is called as `writeAudit(...).catch(...)` in error paths — the
  // global resetAllMocks wipes its factory impl, so re-stub a thenable here.
  vi.mocked(writeAudit).mockResolvedValue(undefined as never);
});

// ── isDomainBuyDryRun ─────────────────────────────────────────────────────────

describe("isDomainBuyDryRun", () => {
  it("returns false when no testMode / dryRun flags are enabled", async () => {
    prismaMock.featureFlag.findMany.mockResolvedValue([]);
    expect(await isDomainBuyDryRun("c1")).toBe(false);
  });

  it("returns true when testMode flag is enabled", async () => {
    prismaMock.featureFlag.findMany.mockResolvedValue([{ id: "f1" }]);
    expect(await isDomainBuyDryRun("c1")).toBe(true);
  });

  it("returns false (not throws) when the db call rejects", async () => {
    prismaMock.featureFlag.findMany.mockRejectedValue(new Error("db error"));
    expect(await isDomainBuyDryRun("c1")).toBe(false);
  });
});

// ── lookupDomain ──────────────────────────────────────────────────────────────

describe("lookupDomain", () => {
  it("returns registrar_unavailable when the registrar is not configured", async () => {
    mockRegistrar.configured.mockReturnValue(false);
    const result = await lookupDomain("acme.com");
    expect(result).toEqual({ ok: false, reason: "registrar_unavailable" });
  });

  it("returns invalid for a malformed domain", async () => {
    const result = await lookupDomain("not-a-domain!!");
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("returns empty for empty input", async () => {
    const result = await lookupDomain("");
    expect(result).toMatchObject({ ok: false, reason: "empty" });
  });

  it("returns lookup result when available and affordable", async () => {
    const r = mockRegistrar;
    r.configured.mockReturnValue(true);
    r.lookup.mockResolvedValue({ available: true, price: { priceCents: 1200 } });

    const result = await lookupDomain("acme.com");

    expect(result).toMatchObject({
      ok: true,
      result: { domain: "acme.com", available: true, priceCents: 1200, affordable: true },
    });
  });

  it("returns affordable: false when price exceeds the cap (default 2000 cents)", async () => {
    const r = mockRegistrar;
    r.configured.mockReturnValue(true);
    r.lookup.mockResolvedValue({ available: true, price: { priceCents: 5000 } });

    const result = await lookupDomain("expensive.com");

    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.result.affordable).toBe(false);
  });

  it("returns lookup_failed when the registrar throws", async () => {
    const r = mockRegistrar;
    r.configured.mockReturnValue(true);
    r.lookup.mockRejectedValue(new Error("network error"));

    const result = await lookupDomain("acme.com");
    expect(result).toEqual({ ok: false, reason: "lookup_failed" });
  });
});

// ── requestPurchaseDomain ─────────────────────────────────────────────────────

describe("requestPurchaseDomain", () => {
  it("returns no_site when the client has no website", async () => {
    prismaMock.website.findFirst.mockResolvedValue(null);
    const result = await requestPurchaseDomain("c1", "acme.com");
    expect(result).toEqual({ ok: false, reason: "no_site" });
  });

  it("returns in_progress when the site already has a live domain", async () => {
    prismaMock.website.findFirst.mockResolvedValue({ id: "w1" });
    prismaMock.websiteDomain.count.mockResolvedValue(1);
    const result = await requestPurchaseDomain("c1", "acme.com");
    expect(result).toEqual({ ok: false, reason: "in_progress" });
  });

  it("returns registrar_unavailable when the registrar is not configured", async () => {
    prismaMock.website.findFirst.mockResolvedValue({ id: "w1" });
    prismaMock.websiteDomain.count.mockResolvedValue(0);
    mockRegistrar.configured.mockReturnValue(false);
    const result = await requestPurchaseDomain("c1", "acme.com");
    expect(result).toEqual({ ok: false, reason: "registrar_unavailable" });
  });

  it("returns unavailable when the domain is already taken (lookup says so)", async () => {
    prismaMock.website.findFirst.mockResolvedValue({ id: "w1" });
    prismaMock.websiteDomain.count.mockResolvedValue(0);
    const r = mockRegistrar;
    r.configured.mockReturnValue(true);
    r.lookup.mockResolvedValue({ available: false, price: null });
    const result = await requestPurchaseDomain("c1", "acme.com");
    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });

  it("returns taken when another site owns the host", async () => {
    prismaMock.website.findFirst.mockResolvedValue({ id: "w1" });
    prismaMock.websiteDomain.count.mockResolvedValue(0);
    const r = mockRegistrar;
    r.configured.mockReturnValue(true);
    r.lookup.mockResolvedValue({ available: true, price: { priceCents: 1200 } });
    prismaMock.websiteDomain.findFirst.mockResolvedValue({ id: "clash" });
    const result = await requestPurchaseDomain("c1", "acme.com");
    expect(result).toEqual({ ok: false, reason: "taken" });
  });
});

// ── executePurchase ───────────────────────────────────────────────────────────

describe("executePurchase", () => {
  it("returns nothing_to_buy when there are no purchasing rows", async () => {
    prismaMock.website.findUnique.mockResolvedValue({ clientId: "c1" });
    prismaMock.websiteDomain.findMany.mockResolvedValue([]);
    const result = await executePurchase("w1", null);
    expect(result).toEqual({ ok: false, error: "nothing_to_buy" });
  });

  it("dry-run: flips rows to active without calling the registrar", async () => {
    prismaMock.website.findUnique.mockResolvedValue({ clientId: "c1" });
    const primary = { id: "d1", host: "acme.com", isPrimary: true };
    prismaMock.websiteDomain.findMany.mockResolvedValue([primary]);
    // Enable dry-run mode
    prismaMock.featureFlag.findMany.mockResolvedValue([{ id: "f1" }]);
    prismaMock.websiteDomain.updateMany.mockResolvedValue({ count: 1 });

    const result = await executePurchase("w1", null);

    expect(result).toEqual({ ok: true });
    expect(prismaMock.websiteDomain.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "active", error: null } }),
    );
    expect(mockRegistrar.buyDomain).not.toHaveBeenCalled();
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "domain.purchased", metadata: expect.objectContaining({ dryRun: true }) }),
    );
  });

  it("parks rows in error and audits when the registrar throws a RegistrarError", async () => {
    prismaMock.website.findUnique.mockResolvedValue({ clientId: "c1" });
    const primary = { id: "d1", host: "acme.com", isPrimary: true };
    prismaMock.websiteDomain.findMany.mockResolvedValue([primary]);
    prismaMock.featureFlag.findMany.mockResolvedValue([]); // no dry-run
    prismaMock.websiteDomain.updateMany.mockResolvedValue({ count: 1 });

    const r = mockRegistrar;
    r.configured.mockReturnValue(true);
    const RegistrarErr = RegistrarError as new (status: number, code: string, message: string) => Error;
    r.getPrice.mockRejectedValue(new RegistrarErr(422, "price_mismatch", "price changed"));

    const result = await executePurchase("w1", null);

    expect(result.ok).toBe(false);
    expect(prismaMock.websiteDomain.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "error", error: expect.stringContaining("price_mismatch") } }),
    );
  });

  it("calls buyDomain with the re-quoted price and marks rows verifying on success", async () => {
    prismaMock.website.findUnique.mockResolvedValue({ clientId: "c1" });
    const primary = { id: "d1", host: "acme.com", isPrimary: true };
    prismaMock.websiteDomain.findMany.mockResolvedValue([primary]);
    prismaMock.featureFlag.findMany.mockResolvedValue([]); // no dry-run
    prismaMock.websiteDomain.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.websiteDomain.update.mockResolvedValue({});

    const r = mockRegistrar;
    r.configured.mockReturnValue(true);
    r.getPrice.mockResolvedValue({ priceCents: 1200 });
    r.buyDomain.mockResolvedValue({ orderId: "ord1", provider: "vercel" });

    const result = await executePurchase("w1", "admin1");

    expect(result).toEqual({ ok: true });
    expect(r.buyDomain).toHaveBeenCalledWith("acme.com", { expectedPriceCents: 1200 });
    expect(prismaMock.websiteDomain.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "verifying", error: null } }),
    );
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "domain.purchased", actorId: "admin1" }),
    );
    expect(emit).toHaveBeenCalledWith("domain.approved", expect.objectContaining({ domain: "acme.com" }));
  });
});

// ── getConnectInstructions ────────────────────────────────────────────────────

describe("getConnectInstructions", () => {
  it("returns hand-written steps when a guide exists for the registrar", async () => {
    mockGetRegistrarGuide.mockReturnValue({
      name: "GoDaddy",
      steps: ["Step 1", "Step 2"],
      dnsUrl: "https://godaddy.com/dns",
    });

    const result = await getConnectInstructions("godaddy", "acme.com", []);

    expect(result).toEqual({ registrar: "GoDaddy", steps: ["Step 1", "Step 2"], dnsUrl: "https://godaddy.com/dns", ai: false });
  });

  it("returns ai: true with fallback generic steps when no API key", async () => {
    mockGetRegistrarGuide.mockReturnValue(null);
    // No ANTHROPIC_API_KEY in test env → generic steps returned
    const result = await getConnectInstructions("unknown-registrar", "acme.com", [
      { type: "A", name: "@", value: "76.76.21.21" },
    ]);

    expect(result.ai).toBe(true);
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.registrar).toBe("unknown-registrar");
  });

  it("falls back to generic when the registrar key is empty", async () => {
    mockGetRegistrarGuide.mockReturnValue(null);
    const result = await getConnectInstructions("", "acme.com", []);
    expect(result.registrar).toBe("your registrar");
  });
});
