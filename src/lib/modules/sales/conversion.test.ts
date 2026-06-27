import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/modules/registration", () => ({ registerClient: vi.fn() }));

import { convertQuoteToClient } from "./conversion";
import { registerClient } from "@/lib/modules/registration";

function quote(overrides: Record<string, unknown> = {}) {
  return {
    id: "q1",
    salesRepId: "rep1",
    status: "SENT",
    plan: "HONEY",
    offeredSetupFee: 59900,
    offeredMonthlyFee: 8900,
    prospect: { id: "p1", businessName: "Acme", contactName: "Jo", email: "jo@acme.com", businessType: null, phone: null },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prismaMock),
  );
});

describe("convertQuoteToClient", () => {
  it("registers the client and links attribution + offered pricing", async () => {
    prismaMock.quote.findFirst.mockResolvedValue(quote());
    prismaMock.client.findFirst.mockResolvedValue(null);
    vi.mocked(registerClient).mockResolvedValue({ clientId: "c1", isTest: false, plan: "HONEY" } as never);
    prismaMock.client.update.mockResolvedValue({});
    prismaMock.subscription.update.mockResolvedValue({});
    prismaMock.quote.update.mockResolvedValue({});
    prismaMock.prospect.update.mockResolvedValue({});

    const res = await convertQuoteToClient("rep1", "q1", { userId: "u1" });
    expect(res).toEqual({ clientId: "c1" });

    expect(registerClient).toHaveBeenCalledWith(
      expect.objectContaining({ businessName: "Acme", email: "jo@acme.com", plan: "HONEY", ownerName: "Jo" }),
    );
    expect(prismaMock.client.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { prospectId: "p1", sourceQuoteId: "q1" },
    });
    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { clientId: "c1" },
      data: { agreedSetupFee: 59900, agreedMonthlyFee: 8900 },
    });
    expect(prismaMock.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "q1" }, data: expect.objectContaining({ status: "CONVERTED" }) }),
    );
    expect(prismaMock.prospect.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { status: "closed" } });
  });

  it("409 when the quote is already converted", async () => {
    prismaMock.quote.findFirst.mockResolvedValue(quote({ status: "CONVERTED" }));
    await expect(convertQuoteToClient("rep1", "q1")).rejects.toMatchObject({ code: "already_converted", status: 409 });
    expect(registerClient).not.toHaveBeenCalled();
  });

  it("409 when the quote still needs approval", async () => {
    prismaMock.quote.findFirst.mockResolvedValue(quote({ status: "NEEDS_APPROVAL" }));
    await expect(convertQuoteToClient("rep1", "q1")).rejects.toMatchObject({ code: "approval_required" });
  });

  it("400 when the prospect has no email", async () => {
    prismaMock.quote.findFirst.mockResolvedValue(quote({ prospect: { id: "p1", businessName: "Acme", email: null, contactName: null, businessType: null, phone: null } }));
    await expect(convertQuoteToClient("rep1", "q1")).rejects.toMatchObject({ code: "prospect_email_required" });
  });

  it("409 when the prospect already converted to a client", async () => {
    prismaMock.quote.findFirst.mockResolvedValue(quote());
    prismaMock.client.findFirst.mockResolvedValue({ id: "existing" });
    await expect(convertQuoteToClient("rep1", "q1")).rejects.toMatchObject({ code: "prospect_already_converted", status: 409 });
    expect(registerClient).not.toHaveBeenCalled();
  });

  it("404 when the quote isn't the rep's", async () => {
    prismaMock.quote.findFirst.mockResolvedValue(null);
    await expect(convertQuoteToClient("rep1", "q1")).rejects.toMatchObject({ code: "quote_not_found", status: 404 });
  });
});
