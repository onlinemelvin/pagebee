import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/events", () => ({ emit: vi.fn() }));

import { createQuote, sendQuote, decideQuoteApproval } from "./quotes";
import { SalesError } from "./errors";
import { emit } from "@/lib/events";

const HONEY = { setupFee: 69900, monthlyFee: 8900 };

beforeEach(() => {
  vi.clearAllMocks();
  // The global setup's resetAllMocks wipes the cached $transaction implementation; restore it so
  // the array/callback forms keep working across multiple tests in this file.
  prismaMock.$transaction.mockImplementation(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prismaMock),
  );
});

describe("createQuote", () => {
  function wire() {
    prismaMock.salesAssignment.findFirst.mockResolvedValue({ id: "a1" });
    prismaMock.plan.findUnique.mockResolvedValue(HONEY);
  }

  it("creates a DRAFT quote when the offer is within guardrails", async () => {
    wire();
    prismaMock.quote.create.mockResolvedValue({ id: "q1", status: "DRAFT" });
    await createQuote("rep1", { prospectId: "p1", plan: "HONEY", offeredSetupFee: 59900, offeredMonthlyFee: 8900 }, { userId: "u1" });

    const arg = prismaMock.quote.create.mock.calls[0][0];
    expect(arg.data.status).toBe("DRAFT");
    expect(arg.data.requiresApproval).toBe(false);
    expect(arg.data.approvals).toBeUndefined();
    expect(emit).toHaveBeenCalledWith("quote.created", expect.anything());
  });

  it("creates a NEEDS_APPROVAL quote + pending approval for a monthly discount", async () => {
    wire();
    prismaMock.quote.create.mockResolvedValue({ id: "q1", status: "NEEDS_APPROVAL" });
    await createQuote("rep1", { prospectId: "p1", plan: "HONEY", offeredSetupFee: 69900, offeredMonthlyFee: 8000 });

    const arg = prismaMock.quote.create.mock.calls[0][0];
    expect(arg.data.status).toBe("NEEDS_APPROVAL");
    expect(arg.data.requiresApproval).toBe(true);
    expect(arg.data.approvals).toEqual({ create: { status: "PENDING" } });
  });

  it("404 when the rep isn't assigned to the prospect", async () => {
    prismaMock.salesAssignment.findFirst.mockResolvedValue(null);
    await expect(
      createQuote("rep1", { prospectId: "p1", plan: "HONEY", offeredSetupFee: 69900, offeredMonthlyFee: 8900 }),
    ).rejects.toMatchObject({ code: "prospect_not_found", status: 404 });
  });

  it("rejects an offer above listed pricing", async () => {
    wire();
    await expect(
      createQuote("rep1", { prospectId: "p1", plan: "HONEY", offeredSetupFee: 80000, offeredMonthlyFee: 8900 }),
    ).rejects.toMatchObject({ code: "offer_above_listed" });
  });
});

describe("sendQuote", () => {
  it("blocks sending a quote that still needs approval", async () => {
    prismaMock.quote.findFirst.mockResolvedValue({ id: "q1", salesRepId: "rep1", status: "NEEDS_APPROVAL" });
    await expect(sendQuote("rep1", "q1")).rejects.toMatchObject({ code: "approval_required", status: 409 });
    expect(prismaMock.quote.update).not.toHaveBeenCalled();
  });

  it("sends a DRAFT quote", async () => {
    prismaMock.quote.findFirst.mockResolvedValue({ id: "q1", salesRepId: "rep1", status: "DRAFT" });
    prismaMock.quote.update.mockResolvedValue({ id: "q1", status: "SENT" });
    const r = await sendQuote("rep1", "q1", { userId: "u1" });
    expect(r.status).toBe("SENT");
    expect(prismaMock.quote.update).toHaveBeenCalledWith({
      where: { id: "q1" },
      data: { status: "SENT", sentAt: expect.any(Date) },
    });
  });

  it("404 when the quote isn't the rep's", async () => {
    prismaMock.quote.findFirst.mockResolvedValue(null);
    await expect(sendQuote("rep1", "q1")).rejects.toBeInstanceOf(SalesError);
  });
});

describe("decideQuoteApproval", () => {
  it("approves: sets approval APPROVED and quote APPROVED", async () => {
    prismaMock.quoteApproval.findUnique.mockResolvedValue({ id: "ap1", quoteId: "q1", status: "PENDING" });
    prismaMock.quoteApproval.update.mockResolvedValue({ id: "ap1", status: "APPROVED" });
    prismaMock.quote.update.mockResolvedValue({ id: "q1", status: "APPROVED" });

    const r = await decideQuoteApproval("ap1", { decision: "APPROVED" }, { userId: "admin1" });
    expect(r.status).toBe("APPROVED");
    expect(prismaMock.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "q1" }, data: expect.objectContaining({ status: "APPROVED", requiresApproval: false }) }),
    );
  });

  it("rejects: returns the quote to DRAFT", async () => {
    prismaMock.quoteApproval.findUnique.mockResolvedValue({ id: "ap1", quoteId: "q1", status: "PENDING" });
    prismaMock.quoteApproval.update.mockResolvedValue({ id: "ap1", status: "REJECTED" });
    prismaMock.quote.update.mockResolvedValue({ id: "q1", status: "DRAFT" });

    await decideQuoteApproval("ap1", { decision: "REJECTED", comment: "Too steep" }, { userId: "admin1" });
    expect(prismaMock.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "q1" }, data: { status: "DRAFT" } }),
    );
  });

  it("409 when the approval was already decided", async () => {
    prismaMock.quoteApproval.findUnique.mockResolvedValue({ id: "ap1", quoteId: "q1", status: "APPROVED" });
    await expect(decideQuoteApproval("ap1", { decision: "APPROVED" }, { userId: "admin1" })).rejects.toMatchObject({
      code: "already_decided",
      status: 409,
    });
  });
});
