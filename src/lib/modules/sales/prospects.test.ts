import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));

import {
  createProspect,
  listProspects,
  getProspect,
  updateProspect,
  logActivity,
  scheduleFollowUp,
  completeFollowUp,
} from "./prospects";
import { SalesError } from "./errors";
import { writeAudit } from "@/lib/modules/audit";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createProspect", () => {
  it("creates a new prospect, assigns it to the rep, and audits", async () => {
    prismaMock.prospect.findFirst.mockResolvedValue(null);
    prismaMock.prospect.create.mockResolvedValue({ id: "p1", businessName: "Acme" });

    const result = await createProspect("rep1", { businessName: "Acme", phone: "415-555-1234" }, { userId: "u1" });

    expect(result).toEqual({ id: "p1", businessName: "Acme" });
    expect(prismaMock.prospect.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessName: "Acme",
          dedupeKey: "acme|4155551234|",
          assignments: { create: { employeeId: "rep1" } },
        }),
      }),
    );
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "prospect.created", entityId: "p1", metadata: { repId: "rep1" } }),
    );
  });

  it("rejects (409) a business already claimed by another rep — first-touch lock", async () => {
    prismaMock.prospect.findFirst.mockResolvedValue({
      id: "p1",
      assignments: [{ employeeId: "other-rep" }],
    });

    await expect(createProspect("rep1", { businessName: "Acme" })).rejects.toMatchObject({
      code: "prospect_claimed",
      status: 409,
    });
    expect(prismaMock.prospect.create).not.toHaveBeenCalled();
  });

  it("is idempotent when the rep re-adds their own prospect", async () => {
    const existing = { id: "p1", assignments: [{ employeeId: "rep1" }] };
    prismaMock.prospect.findFirst.mockResolvedValue(existing);

    const result = await createProspect("rep1", { businessName: "Acme" });
    expect(result).toBe(existing);
    expect(prismaMock.prospect.create).not.toHaveBeenCalled();
  });

  it("throws on invalid input (no business name)", async () => {
    await expect(createProspect("rep1", { businessName: "" })).rejects.toBeTruthy();
  });
});

describe("listProspects", () => {
  it("scopes the query to the rep's assignments", async () => {
    prismaMock.prospect.findMany.mockResolvedValue([]);
    await listProspects("rep1", { search: "acme", status: "new" });
    expect(prismaMock.prospect.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assignments: { some: { employeeId: "rep1" } },
          status: "new",
        }),
      }),
    );
  });
});

describe("getProspect (scoping)", () => {
  it("throws 404 when the prospect is not assigned to the rep", async () => {
    prismaMock.salesAssignment.findFirst.mockResolvedValue(null);
    await expect(getProspect("rep1", "p1")).rejects.toBeInstanceOf(SalesError);
    expect(prismaMock.prospect.findUnique).not.toHaveBeenCalled();
  });

  it("returns the prospect when assigned", async () => {
    prismaMock.salesAssignment.findFirst.mockResolvedValue({ id: "a1" });
    prismaMock.prospect.findUnique.mockResolvedValue({ id: "p1" });
    await expect(getProspect("rep1", "p1")).resolves.toEqual({ id: "p1" });
  });
});

describe("updateProspect (scoping)", () => {
  it("refuses to update a prospect the rep does not own", async () => {
    prismaMock.salesAssignment.findFirst.mockResolvedValue(null);
    await expect(updateProspect("rep1", "p1", { status: "qualified" })).rejects.toBeInstanceOf(SalesError);
    expect(prismaMock.prospect.update).not.toHaveBeenCalled();
  });
});

describe("logActivity / scheduleFollowUp (scoping)", () => {
  it("logActivity requires assignment", async () => {
    prismaMock.salesAssignment.findFirst.mockResolvedValue(null);
    await expect(logActivity("rep1", "p1", { type: "call", summary: "hi" })).rejects.toBeInstanceOf(SalesError);
  });

  it("scheduleFollowUp sets the rep as assignee", async () => {
    prismaMock.salesAssignment.findFirst.mockResolvedValue({ id: "a1" });
    prismaMock.followUp.create.mockResolvedValue({ id: "f1" });
    await scheduleFollowUp("rep1", "p1", { dueAt: "2026-07-01T10:00:00Z" });
    expect(prismaMock.followUp.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ prospectId: "p1", assignedToId: "rep1" }) }),
    );
  });
});

describe("completeFollowUp (scoping)", () => {
  it("throws 404 when the follow-up is not the rep's", async () => {
    prismaMock.followUp.findFirst.mockResolvedValue(null);
    await expect(completeFollowUp("rep1", "f1")).rejects.toBeInstanceOf(SalesError);
    expect(prismaMock.followUp.update).not.toHaveBeenCalled();
  });
});
