import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

// The signing secret module uses a dev default in test env — no need to mock it.

import {
  customerUnsubToken,
  verifyCustomerUnsubToken,
  customerEmailConsent,
  setCustomerEmailConsent,
  unsubscribeCustomerByToken,
} from "./customer-consent";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("customerUnsubToken / verifyCustomerUnsubToken", () => {
  it("generates a token and verifies it round-trip", () => {
    const token = customerUnsubToken("cust-123");
    expect(token).toContain("cust-123");
    const result = verifyCustomerUnsubToken(token);
    expect(result).toBe("cust-123");
  });

  it("returns null for a malformed token (no dot)", () => {
    expect(verifyCustomerUnsubToken("nodot")).toBeNull();
  });

  it("returns null when the signature does not match", () => {
    const token = customerUnsubToken("cust-abc");
    const tampered = token.slice(0, -3) + "xxx";
    expect(verifyCustomerUnsubToken(tampered)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(verifyCustomerUnsubToken("")).toBeNull();
  });
});

describe("customerEmailConsent", () => {
  it("returns granted when consent row has granted=true", async () => {
    prismaMock.customerConsent.findUnique.mockResolvedValue({ granted: true } as never);
    expect(await customerEmailConsent("cust-1")).toBe("granted");
  });

  it("returns revoked when consent row has granted=false", async () => {
    prismaMock.customerConsent.findUnique.mockResolvedValue({ granted: false } as never);
    expect(await customerEmailConsent("cust-1")).toBe("revoked");
  });

  it("returns unknown when no consent row exists", async () => {
    prismaMock.customerConsent.findUnique.mockResolvedValue(null);
    expect(await customerEmailConsent("cust-1")).toBe("unknown");
  });
});

describe("setCustomerEmailConsent", () => {
  it("upserts with granted=true and sets grantedAt", async () => {
    prismaMock.customerConsent.upsert.mockResolvedValue({} as never);
    await setCustomerEmailConsent("cust-1", true);
    expect(prismaMock.customerConsent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ granted: true, grantedAt: expect.any(Date), revokedAt: null }),
        update: expect.objectContaining({ granted: true, grantedAt: expect.any(Date), revokedAt: null }),
      }),
    );
  });

  it("upserts with granted=false and sets revokedAt", async () => {
    prismaMock.customerConsent.upsert.mockResolvedValue({} as never);
    await setCustomerEmailConsent("cust-1", false);
    expect(prismaMock.customerConsent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ granted: false, grantedAt: null, revokedAt: expect.any(Date) }),
        update: expect.objectContaining({ granted: false, revokedAt: expect.any(Date) }),
      }),
    );
  });
});

describe("unsubscribeCustomerByToken", () => {
  it("returns null for an invalid token", async () => {
    const result = await unsubscribeCustomerByToken("bad.token");
    // The HMAC won't verify, so it returns null without hitting the DB
    expect(result).toBeNull();
    expect(prismaMock.customer.findUnique).not.toHaveBeenCalled();
  });

  it("returns null when customer is not found in DB", async () => {
    const token = customerUnsubToken("cust-x");
    prismaMock.customer.findUnique.mockResolvedValue(null);
    const result = await unsubscribeCustomerByToken(token);
    expect(result).toBeNull();
  });

  it("revokes consent and returns businessName on success", async () => {
    const token = customerUnsubToken("cust-y");
    prismaMock.customer.findUnique.mockResolvedValue({
      id: "cust-y",
      client: { businessName: "Great Biz" },
    } as never);
    prismaMock.customerConsent.upsert.mockResolvedValue({} as never);

    const result = await unsubscribeCustomerByToken(token);
    expect(result).toEqual({ businessName: "Great Biz" });
    expect(prismaMock.customerConsent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ granted: false }),
      }),
    );
  });
});
