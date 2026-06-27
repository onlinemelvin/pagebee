import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

// workspace.ts uses React cache() — mock the whole react module before any import
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));

// Server-only deps that workspace pulls in
vi.mock("@/lib/auth/session", () => ({ getAuthContext: vi.fn() }));
vi.mock("@/lib/plans", () => ({
  planForFlag: vi.fn(() => null),
  nextTier: vi.fn(() => null),
}));
vi.mock("@/lib/modules/website", () => ({ autoReleaseStalePreview: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/auth/policy", () => ({ isTestModeEligible: vi.fn(() => false) }));

import { setClientFeature, isClientFeature, isTestMode, TEST_MODE_KEY } from "./workspace";

beforeEach(() => {
  vi.clearAllMocks();
});

// ── setClientFeature ──────────────────────────────────────────────────────────

describe("setClientFeature", () => {
  it("upserts the feature flag with the given enabled value", async () => {
    prismaMock.featureFlag.upsert.mockResolvedValue({} as never);

    await setClientFeature("c1", "booking", true);

    expect(prismaMock.featureFlag.upsert).toHaveBeenCalledWith({
      where: { clientId_key: { clientId: "c1", key: "booking" } },
      update: { enabled: true },
      create: { clientId: "c1", key: "booking", enabled: true },
    });
  });

  it("upserts with false to disable a feature", async () => {
    prismaMock.featureFlag.upsert.mockResolvedValue({} as never);

    await setClientFeature("c1", "invoices", false);

    expect(prismaMock.featureFlag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { enabled: false }, create: expect.objectContaining({ enabled: false }) }),
    );
  });
});

// ── isClientFeature ───────────────────────────────────────────────────────────

describe("isClientFeature", () => {
  it("returns true when the flag row has enabled:true", async () => {
    prismaMock.featureFlag.findUnique.mockResolvedValue({ enabled: true });
    expect(await isClientFeature("c1", "booking")).toBe(true);
  });

  it("returns false when the flag row has enabled:false", async () => {
    prismaMock.featureFlag.findUnique.mockResolvedValue({ enabled: false });
    expect(await isClientFeature("c1", "booking")).toBe(false);
  });

  it("returns false when no flag row exists", async () => {
    prismaMock.featureFlag.findUnique.mockResolvedValue(null);
    expect(await isClientFeature("c1", "booking")).toBe(false);
  });

  it("returns false when DB throws (catch → null)", async () => {
    prismaMock.featureFlag.findUnique.mockRejectedValue(new Error("db error"));
    expect(await isClientFeature("c1", "booking")).toBe(false);
  });

  it("queries by clientId_key composite key", async () => {
    prismaMock.featureFlag.findUnique.mockResolvedValue(null);
    await isClientFeature("c1", "chat");
    expect(prismaMock.featureFlag.findUnique).toHaveBeenCalledWith({
      where: { clientId_key: { clientId: "c1", key: "chat" } },
      select: { enabled: true },
    });
  });
});

// ── isTestMode ────────────────────────────────────────────────────────────────

describe("isTestMode", () => {
  it("returns false when the testMode flag is absent", async () => {
    prismaMock.featureFlag.findUnique.mockResolvedValue(null);
    expect(await isTestMode("c1")).toBe(false);
  });

  it("returns true when the testMode flag is enabled", async () => {
    prismaMock.featureFlag.findUnique.mockResolvedValue({ enabled: true });
    expect(await isTestMode("c1")).toBe(true);
  });

  it("uses TEST_MODE_KEY as the flag key", async () => {
    prismaMock.featureFlag.findUnique.mockResolvedValue(null);
    await isTestMode("c1");
    expect(prismaMock.featureFlag.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId_key: { clientId: "c1", key: TEST_MODE_KEY } } }),
    );
  });
});
