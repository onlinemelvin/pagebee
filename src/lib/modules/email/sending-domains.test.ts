import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/website/domain", () => ({
  getDomainState: vi.fn(),
}));
vi.mock("@/lib/resend/domains", () => ({
  createResendDomain: vi.fn(),
  getResendDomain: vi.fn(),
  verifyResendDomain: vi.fn().mockResolvedValue(undefined),
  deleteResendDomain: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/modules/audit", () => ({
  writeAudit: vi.fn().mockResolvedValue(undefined),
}));

import {
  provisionSendingDomain,
  checkSendingDomain,
  sweepSendingDomains,
  removeSendingDomain,
} from "./sending-domains";
import { getDomainState } from "@/lib/modules/website/domain";
import { createResendDomain, getResendDomain, verifyResendDomain, deleteResendDomain } from "@/lib/resend/domains";
import { writeAudit } from "@/lib/modules/audit";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("provisionSendingDomain", () => {
  it("throws no_active_custom_domain when domain state is not active", async () => {
    vi.mocked(getDomainState).mockResolvedValue({ status: "pending", domain: null } as never);
    await expect(provisionSendingDomain("c1")).rejects.toThrow("no_active_custom_domain");
  });

  it("throws no_active_custom_domain when no domain state exists", async () => {
    vi.mocked(getDomainState).mockResolvedValue(null);
    await expect(provisionSendingDomain("c1")).rejects.toThrow("no_active_custom_domain");
  });

  it("throws domain_taken when another client already owns the sending domain", async () => {
    vi.mocked(getDomainState).mockResolvedValue({ status: "active", domain: "www.acme.com" } as never);
    prismaMock.sendingDomain.findFirst.mockResolvedValue({ id: "conflict" } as never);
    await expect(provisionSendingDomain("c1")).rejects.toThrow("domain_taken");
  });

  it("creates and persists a Resend domain for a new client", async () => {
    vi.mocked(getDomainState).mockResolvedValue({ status: "active", domain: "www.acme.com" } as never);
    // no conflict
    prismaMock.sendingDomain.findFirst.mockResolvedValue(null);
    // no existing row
    prismaMock.sendingDomain.findUnique.mockResolvedValue(null);
    vi.mocked(createResendDomain).mockResolvedValue({ id: "resend-dom-1", status: "pending", records: [] } as never);
    prismaMock.sendingDomain.upsert.mockResolvedValue({ id: "row1" } as never);

    await provisionSendingDomain("c1");

    expect(createResendDomain).toHaveBeenCalledWith("acme.com");
    expect(prismaMock.sendingDomain.upsert).toHaveBeenCalled();
    expect(writeAudit).toHaveBeenCalled();
  });

  it("strips www. when deriving the sending domain", async () => {
    vi.mocked(getDomainState).mockResolvedValue({ status: "active", domain: "www.mybiz.co.uk" } as never);
    prismaMock.sendingDomain.findFirst.mockResolvedValue(null);
    prismaMock.sendingDomain.findUnique.mockResolvedValue(null);
    vi.mocked(createResendDomain).mockResolvedValue({ id: "r1", status: "pending", records: [] } as never);
    prismaMock.sendingDomain.upsert.mockResolvedValue({} as never);

    await provisionSendingDomain("c1");
    expect(createResendDomain).toHaveBeenCalledWith("mybiz.co.uk");
  });

  it("throws 502 when Resend API returns an error", async () => {
    vi.mocked(getDomainState).mockResolvedValue({ status: "active", domain: "acme.com" } as never);
    prismaMock.sendingDomain.findFirst.mockResolvedValue(null);
    prismaMock.sendingDomain.findUnique.mockResolvedValue(null);
    vi.mocked(createResendDomain).mockResolvedValue({ error: "api_error" } as never);

    await expect(provisionSendingDomain("c1")).rejects.toThrow("api_error");
  });
});

describe("checkSendingDomain", () => {
  it("returns the row unchanged when no resendDomainId", async () => {
    prismaMock.sendingDomain.findUnique.mockResolvedValue({ id: "row1", resendDomainId: null } as never);
    const result = await checkSendingDomain("row1");
    expect(result).toEqual({ id: "row1", resendDomainId: null });
    expect(verifyResendDomain).not.toHaveBeenCalled();
  });

  it("updates status to VERIFIED and writes audit when domain verifies", async () => {
    prismaMock.sendingDomain.findUnique.mockResolvedValue({
      id: "row1",
      resendDomainId: "resend-1",
      status: "PENDING",
      verifiedAt: null,
      clientId: "c1",
      domain: "acme.com",
    } as never);
    vi.mocked(getResendDomain).mockResolvedValue({ status: "verified", records: [] } as never);
    prismaMock.sendingDomain.update.mockResolvedValue({ id: "row1", status: "VERIFIED" } as never);

    const result = await checkSendingDomain("row1");
    expect(result?.status).toBe("VERIFIED");
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "email.sending_domain_verified" }),
    );
  });

  it("does not write audit when domain was already verified before", async () => {
    prismaMock.sendingDomain.findUnique.mockResolvedValue({
      id: "row1",
      resendDomainId: "resend-1",
      status: "VERIFIED",
      verifiedAt: new Date(), // already set
      clientId: "c1",
      domain: "acme.com",
    } as never);
    vi.mocked(getResendDomain).mockResolvedValue({ status: "verified", records: [] } as never);
    prismaMock.sendingDomain.update.mockResolvedValue({ id: "row1", status: "VERIFIED" } as never);

    await checkSendingDomain("row1");
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("records lastError when Resend returns an error", async () => {
    prismaMock.sendingDomain.findUnique.mockResolvedValue({
      id: "row1",
      resendDomainId: "resend-1",
    } as never);
    vi.mocked(getResendDomain).mockResolvedValue({ error: "dns_error" } as never);
    prismaMock.sendingDomain.update.mockResolvedValue({} as never);

    await checkSendingDomain("row1");
    expect(prismaMock.sendingDomain.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lastError: "dns_error" } }),
    );
  });
});

describe("sweepSendingDomains", () => {
  it("retires stale PENDING domains and reports count", async () => {
    prismaMock.sendingDomain.updateMany.mockResolvedValue({ count: 3 } as never);
    prismaMock.sendingDomain.findMany.mockResolvedValue([]);

    const result = await sweepSendingDomains();
    expect(result.retired).toBe(3);
    expect(result.checked).toBe(0);
  });

  it("checks pending domains and counts newly verified ones", async () => {
    prismaMock.sendingDomain.updateMany.mockResolvedValue({ count: 0 } as never);
    prismaMock.sendingDomain.findMany.mockResolvedValue([{ id: "d1" }, { id: "d2" }] as never);
    // Mock checkSendingDomain internals
    prismaMock.sendingDomain.findUnique
      .mockResolvedValueOnce({ id: "d1", resendDomainId: "r1", status: "PENDING", verifiedAt: null, clientId: "c1", domain: "x.com" } as never)
      .mockResolvedValueOnce({ id: "d2", resendDomainId: "r2", status: "PENDING", verifiedAt: null, clientId: "c2", domain: "y.com" } as never);
    vi.mocked(getResendDomain)
      .mockResolvedValueOnce({ status: "verified", records: [] } as never)
      .mockResolvedValueOnce({ status: "pending", records: [] } as never);
    prismaMock.sendingDomain.update
      .mockResolvedValueOnce({ id: "d1", status: "VERIFIED" } as never)
      .mockResolvedValueOnce({ id: "d2", status: "PENDING" } as never);

    const result = await sweepSendingDomains();
    expect(result.checked).toBe(2);
    expect(result.verified).toBe(1);
  });
});

describe("removeSendingDomain", () => {
  it("does nothing when no domain exists for the client", async () => {
    prismaMock.sendingDomain.findFirst.mockResolvedValue(null);
    await removeSendingDomain("c1");
    expect(deleteResendDomain).not.toHaveBeenCalled();
    expect(prismaMock.sendingDomain.delete).not.toHaveBeenCalled();
  });

  it("calls deleteResendDomain and deletes the row", async () => {
    prismaMock.sendingDomain.findFirst.mockResolvedValue({ id: "row1", resendDomainId: "resend-1" } as never);
    prismaMock.sendingDomain.delete.mockResolvedValue({} as never);

    await removeSendingDomain("c1");
    expect(deleteResendDomain).toHaveBeenCalledWith("resend-1");
    expect(prismaMock.sendingDomain.delete).toHaveBeenCalledWith({ where: { id: "row1" } });
  });
});
