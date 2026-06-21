import { describe, it, expect } from "vitest";
import { assertFeature, accountAccess, type PolicyClient } from "./policy";
import { AuthError } from "./errors";

function client(over: Partial<PolicyClient> & { flags?: Record<string, unknown> } = {}): PolicyClient {
  const { flags, ...rest } = over;
  return {
    status: "active",
    subscription: { status: "ACTIVE", plan: { featureFlags: flags ?? {} } },
    ...rest,
  };
}

// assertFeature is the backend tenant-capability gate — the audit's "backend is
// the source of truth" invariant. It must throw 403 unless the plan grants the flag.
describe("assertFeature", () => {
  it("passes when the plan flag is exactly true", () => {
    expect(() => assertFeature(client({ flags: { customDomain: true } }), "customDomain")).not.toThrow();
  });

  it("throws 403 when the flag is false/absent/truthy-but-not-true", () => {
    for (const flags of [{}, { customDomain: false }, { customDomain: 1 }, { customDomain: "yes" }]) {
      try {
        assertFeature(client({ flags }), "customDomain");
        throw new Error("expected assertFeature to throw");
      } catch (e) {
        expect(e).toBeInstanceOf(AuthError);
        expect((e as AuthError).status).toBe(403);
      }
    }
  });

  it("throws when there is no subscription", () => {
    expect(() => assertFeature({ status: "active", subscription: null }, "customDomain")).toThrow(AuthError);
  });
});

// accountAccess encodes the grace policy (failed payment ≠ instant lockout).
describe("accountAccess", () => {
  it("allows active accounts", () => {
    expect(accountAccess(client())).toEqual({ ok: true, warn: false, reason: null });
  });

  it("warns (but allows) during a payment grace period", () => {
    const r = accountAccess(client({ subscription: { status: "PAST_DUE", plan: { featureFlags: {} } } }));
    expect(r).toEqual({ ok: true, warn: true, reason: "payment_past_due" });
  });

  it("blocks suspended/cancelled subscriptions and suspended/churned clients", () => {
    expect(accountAccess(client({ subscription: { status: "CANCELLED", plan: { featureFlags: {} } } })).ok).toBe(false);
    expect(accountAccess(client({ status: "suspended" })).ok).toBe(false);
    expect(accountAccess(client({ status: "churned" })).ok).toBe(false);
  });
});
