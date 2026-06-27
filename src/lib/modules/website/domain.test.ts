import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/events", () => ({ emit: vi.fn() }));
vi.mock("@/lib/vercel/domains", () => ({
  vercelConfigured: vi.fn(() => false),
  addProjectDomain: vi.fn(),
  verifyProjectDomain: vi.fn(),
  removeProjectDomain: vi.fn(),
  VercelError: class VercelError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message);
      this.name = "VercelError";
    }
  },
}));

import {
  getDomainState,
  requestCustomDomain,
  removeCustomDomain,
  pollDomainVerification,
  verifyClientDomains,
} from "./domain";
import { writeAudit } from "@/lib/modules/audit";
import { emit } from "@/lib/events";
import { vercelConfigured, addProjectDomain, verifyProjectDomain } from "@/lib/vercel/domains";

const mockVercelConfigured = vercelConfigured as ReturnType<typeof vi.fn>;
const mockAddProjectDomain = addProjectDomain as ReturnType<typeof vi.fn>;
const mockVerifyProjectDomain = verifyProjectDomain as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockVercelConfigured.mockReturnValue(false);
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeHostRow(overrides: Record<string, unknown> = {}) {
  return {
    host: "acme.com",
    kind: "apex",
    isPrimary: true,
    status: "verifying",
    verification: null,
    error: null,
    requestedAt: new Date("2024-01-01"),
    source: "connect",
    priceCents: null,
    ...overrides,
  };
}

// ── getDomainState ────────────────────────────────────────────────────────────

describe("getDomainState", () => {
  it("returns null when the client has no website", async () => {
    prismaMock.website.findFirst.mockResolvedValue(null);
    expect(await getDomainState("c1")).toBeNull();
  });

  it("returns an empty-state aggregate when no live domain rows exist", async () => {
    prismaMock.website.findFirst.mockResolvedValue({ id: "w1" });
    prismaMock.websiteDomain.findMany.mockResolvedValue([]);

    const state = await getDomainState("c1");
    expect(state).toEqual({ domain: null, status: null, hosts: [], requestedAt: null });
  });

  it("sets aggregate status to 'active' when the primary is active", async () => {
    prismaMock.website.findFirst.mockResolvedValue({ id: "w1" });
    prismaMock.websiteDomain.findMany.mockResolvedValue([makeHostRow({ status: "active" })]);

    const state = await getDomainState("c1");
    expect(state?.status).toBe("active");
    expect(state?.domain).toBe("acme.com");
  });

  it("sets aggregate status to 'error' when any host has an error", async () => {
    prismaMock.website.findFirst.mockResolvedValue({ id: "w1" });
    prismaMock.websiteDomain.findMany.mockResolvedValue([
      makeHostRow({ isPrimary: true, status: "active" }),
      makeHostRow({ host: "www.acme.com", kind: "www", isPrimary: false, status: "error" }),
    ]);

    const state = await getDomainState("c1");
    expect(state?.status).toBe("error");
  });
});

// ── requestCustomDomain ───────────────────────────────────────────────────────

describe("requestCustomDomain", () => {
  it("returns no_site when the client has no website", async () => {
    prismaMock.website.findFirst.mockResolvedValue(null);
    const result = await requestCustomDomain("c1", "acme.com");
    expect(result).toEqual({ ok: false, reason: "no_site" });
  });

  it("returns empty/invalid for bad domain input", async () => {
    prismaMock.website.findFirst.mockResolvedValue({ id: "w1" });
    const empty = await requestCustomDomain("c1", "");
    expect(empty).toMatchObject({ ok: false, reason: "empty" });

    prismaMock.website.findFirst.mockResolvedValue({ id: "w1" });
    const invalid = await requestCustomDomain("c1", "not a domain!!");
    expect(invalid).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("returns platform_domain for the root domain and its subdomains", async () => {
    prismaMock.website.findFirst.mockResolvedValue({ id: "w1" });
    // pagebee.com is the root if NEXT_PUBLIC_ROOT_DOMAIN is not set (defaults to localhost:3000)
    // so we use localhost subdomain in the test
    const result = await requestCustomDomain("c1", "sub.localhost");
    expect(result).toMatchObject({ ok: false });
  });

  it("returns in_progress when the site already has a live domain connection", async () => {
    prismaMock.website.findFirst.mockResolvedValue({ id: "w1" });
    prismaMock.websiteDomain.count.mockResolvedValue(1);
    const result = await requestCustomDomain("c1", "acme.com");
    expect(result).toEqual({ ok: false, reason: "in_progress" });
  });

  it("returns taken when the domain host is used by another site", async () => {
    prismaMock.website.findFirst.mockResolvedValue({ id: "w1" });
    prismaMock.websiteDomain.count.mockResolvedValue(0);
    prismaMock.websiteDomain.findFirst.mockResolvedValue({ id: "clash" });
    const result = await requestCustomDomain("c1", "acme.com");
    expect(result).toEqual({ ok: false, reason: "taken" });
  });

  it("creates host rows, audits, and emits domain.requested on success (no Vercel)", async () => {
    prismaMock.website.findFirst
      .mockResolvedValueOnce({ id: "w1" }) // siteIdForClient
      .mockResolvedValueOnce({ id: "w1" }); // getDomainState → siteIdForClient
    prismaMock.websiteDomain.count.mockResolvedValue(0);
    prismaMock.websiteDomain.findFirst.mockResolvedValue(null); // no clash
    prismaMock.websiteDomain.createMany.mockResolvedValue({ count: 2 });
    prismaMock.websiteDomain.findMany
      .mockResolvedValueOnce([
        { id: "d1", host: "acme.com", isPrimary: true, verification: null },
        { id: "d2", host: "www.acme.com", isPrimary: false, verification: null },
      ]) // rows after createMany
      .mockResolvedValueOnce([makeHostRow(), makeHostRow({ host: "www.acme.com", kind: "www", isPrimary: false })]); // getDomainState
    prismaMock.websiteDomain.update.mockResolvedValue({});

    const result = await requestCustomDomain("c1", "acme.com");

    expect(result.ok).toBe(true);
    expect(prismaMock.websiteDomain.createMany).toHaveBeenCalled();
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "domain.connected", clientId: "c1" }));
    expect(emit).toHaveBeenCalledWith("domain.requested", expect.objectContaining({ domain: "acme.com" }));
  });

  it("returns taken on a P2002 unique constraint error", async () => {
    prismaMock.website.findFirst.mockResolvedValue({ id: "w1" });
    prismaMock.websiteDomain.count.mockResolvedValue(0);
    prismaMock.websiteDomain.findFirst.mockResolvedValue(null);
    const constraintErr = Object.assign(new Error("Unique"), { code: "P2002" });
    prismaMock.websiteDomain.createMany.mockRejectedValue(constraintErr);

    const result = await requestCustomDomain("c1", "acme.com");
    expect(result).toEqual({ ok: false, reason: "taken" });
  });
});

// ── removeCustomDomain ────────────────────────────────────────────────────────

describe("removeCustomDomain", () => {
  it("returns ok: false when there is no website", async () => {
    prismaMock.website.findFirst.mockResolvedValue(null);
    expect(await removeCustomDomain("c1")).toEqual({ ok: false });
  });

  it("returns ok: false when there are no domain rows to remove", async () => {
    prismaMock.website.findFirst.mockResolvedValue({ id: "w1" });
    prismaMock.websiteDomain.findMany.mockResolvedValue([]);
    prismaMock.websiteDomain.deleteMany.mockResolvedValue({ count: 0 });
    expect(await removeCustomDomain("c1")).toEqual({ ok: false });
  });

  it("deletes all rows, audits, and returns ok when rows exist", async () => {
    prismaMock.website.findFirst.mockResolvedValue({ id: "w1" });
    prismaMock.websiteDomain.findMany.mockResolvedValue([
      { host: "acme.com", status: "active" },
      { host: "www.acme.com", status: "active" },
    ]);
    prismaMock.websiteDomain.deleteMany.mockResolvedValue({ count: 2 });

    const result = await removeCustomDomain("c1");

    expect(result).toEqual({ ok: true });
    expect(prismaMock.websiteDomain.deleteMany).toHaveBeenCalledWith({ where: { websiteId: "w1" } });
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "domain.removed", clientId: "c1" }));
  });
});

// ── pollDomainVerification ────────────────────────────────────────────────────

describe("pollDomainVerification", () => {
  it("returns {checked: 0, activated: 0} when Vercel is not configured", async () => {
    mockVercelConfigured.mockReturnValue(false);
    const result = await pollDomainVerification();
    expect(result).toEqual({ checked: 0, activated: 0 });
    expect(prismaMock.websiteDomain.findMany).not.toHaveBeenCalled();
  });

  it("activates verified domains via Vercel API", async () => {
    mockVercelConfigured.mockReturnValue(true);
    const row = {
      id: "d1",
      host: "acme.com",
      isPrimary: true,
      source: "connect",
      websiteId: "w1",
      website: { clientId: "c1" },
    };
    prismaMock.websiteDomain.findMany.mockResolvedValue([row]);
    mockVerifyProjectDomain.mockResolvedValue({ verified: true });
    prismaMock.websiteDomain.update.mockResolvedValue({});

    const result = await pollDomainVerification();

    expect(result.checked).toBe(1);
    expect(result.activated).toBe(1);
    expect(prismaMock.websiteDomain.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "active", error: null } }),
    );
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "domain.active" }));
    expect(emit).toHaveBeenCalledWith("domain.active", expect.objectContaining({ clientId: "c1" }));
  });

  it("does not activate when Vercel says not yet verified", async () => {
    mockVercelConfigured.mockReturnValue(true);
    prismaMock.websiteDomain.findMany.mockResolvedValue([
      { id: "d1", host: "acme.com", isPrimary: true, source: "connect", websiteId: "w1", website: { clientId: "c1" } },
    ]);
    mockVerifyProjectDomain.mockResolvedValue({ verified: false });

    const result = await pollDomainVerification();

    expect(result.activated).toBe(0);
    expect(prismaMock.websiteDomain.update).not.toHaveBeenCalled();
  });

  it("re-asserts project attachment for purchase-source rows before verifying", async () => {
    mockVercelConfigured.mockReturnValue(true);
    const row = {
      id: "d1",
      host: "acme.com",
      isPrimary: true,
      source: "purchase", // triggers re-attach logic
      websiteId: "w1",
      website: { clientId: "c1" },
    };
    prismaMock.websiteDomain.findMany.mockResolvedValue([row]);
    mockAddProjectDomain.mockResolvedValue({ verified: true, name: "acme.com" });
    mockVerifyProjectDomain.mockResolvedValue({ verified: true });
    prismaMock.websiteDomain.update.mockResolvedValue({});

    await pollDomainVerification();

    expect(mockAddProjectDomain).toHaveBeenCalledWith("acme.com", { redirect: undefined });
  });

  it("skips only the erroring row (does not fail entire batch on transient error)", async () => {
    mockVercelConfigured.mockReturnValue(true);
    prismaMock.websiteDomain.findMany.mockResolvedValue([
      { id: "d1", host: "bad.com", isPrimary: true, source: "connect", websiteId: "w1", website: { clientId: "c1" } },
      { id: "d2", host: "good.com", isPrimary: true, source: "connect", websiteId: "w2", website: { clientId: "c2" } },
    ]);
    mockVerifyProjectDomain
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({ verified: true });
    prismaMock.websiteDomain.update.mockResolvedValue({});

    const result = await pollDomainVerification();

    expect(result.activated).toBe(1); // only the good one
  });
});

// ── verifyClientDomains ───────────────────────────────────────────────────────

describe("verifyClientDomains", () => {
  it("returns null when there is no website for the client", async () => {
    prismaMock.website.findFirst.mockResolvedValue(null);
    expect(await verifyClientDomains("c1")).toBeNull();
  });

  it("skips Vercel verification when Vercel is not configured, still returns state", async () => {
    mockVercelConfigured.mockReturnValue(false);
    prismaMock.website.findFirst.mockResolvedValue({ id: "w1" });
    prismaMock.websiteDomain.findMany.mockResolvedValue([makeHostRow({ status: "verifying" })]);

    const state = await verifyClientDomains("c1");

    expect(mockVerifyProjectDomain).not.toHaveBeenCalled();
    expect(state).not.toBeNull();
  });
});
