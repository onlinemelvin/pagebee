import { describe, it, expect, vi, afterEach } from "vitest";
import { signingSecret } from "./secret";

// Signing secrets must FAIL CLOSED in production (no hardcoded/forgeable
// fallback) but stay usable in dev. Guards the Tier 1 token-forgery fix.
afterEach(() => vi.unstubAllEnvs());

describe("signingSecret", () => {
  it("returns the primary env value when set", () => {
    vi.stubEnv("TEST_PRIMARY_SECRET", "real-secret");
    expect(signingSecret("TEST_PRIMARY_SECRET", "TEST_FALLBACK_SECRET")).toBe("real-secret");
  });

  it("falls back to the next env in priority order", () => {
    vi.stubEnv("TEST_FALLBACK_SECRET", "fallback-secret");
    expect(signingSecret("TEST_PRIMARY_SECRET", "TEST_FALLBACK_SECRET")).toBe("fallback-secret");
  });

  it("ignores empty/whitespace-only values", () => {
    vi.stubEnv("TEST_PRIMARY_SECRET", "   ");
    vi.stubEnv("TEST_FALLBACK_SECRET", "ok");
    expect(signingSecret("TEST_PRIMARY_SECRET", "TEST_FALLBACK_SECRET")).toBe("ok");
  });

  it("THROWS in production when nothing is configured (fail closed)", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => signingSecret("TEST_PRIMARY_SECRET", "TEST_FALLBACK_SECRET")).toThrow();
  });

  it("returns a deterministic dev default outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    const a = signingSecret("TEST_PRIMARY_SECRET");
    expect(a).toContain("TEST_PRIMARY_SECRET");
    expect(signingSecret("TEST_PRIMARY_SECRET")).toBe(a); // stable
  });
});
