import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));

import {
  createCustomer,
  listCustomers,
  customerCounts,
  getCustomer,
  updateCustomer,
  setCustomerArchived,
  deleteCustomer,
  mergeCustomers,
  upsertCustomerFromLead,
  CustomerError,
} from "./service";
import { writeAudit } from "@/lib/modules/audit";

beforeEach(() => {
  vi.clearAllMocks();
});

// ── helpers ───────────────────────────────────────────────────────────────────

const NOW = new Date("2026-07-01T00:00:00Z");

function makeCustomer(overrides: Record<string, unknown> = {}) {
  return {
    id: "cust1",
    clientId: "c1",
    name: "Ada Lovelace",
    email: "ada@x.com",
    phone: "555-1234",
    company: null,
    address: null,
    note: null,
    tags: [],
    customFields: null,
    source: "manual",
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    _count: { leads: 0, invoices: 0, bookings: 0 },
    ...overrides,
  };
}

// ── createCustomer ────────────────────────────────────────────────────────────

describe("createCustomer", () => {
  it("creates a customer scoped to the tenant and audits", async () => {
    prismaMock.customer.create.mockResolvedValue(makeCustomer() as never);

    const result = await createCustomer("c1", { name: "Ada Lovelace", email: "ada@x.com" });
    expect(prismaMock.customer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ clientId: "c1", name: "Ada Lovelace" }),
      }),
    );
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "customer.created", clientId: "c1", entityId: "cust1" }),
    );
    expect(result.id).toBe("cust1");
  });

  it("returns a DTO with proper field mapping (archivedAt → archived boolean)", async () => {
    prismaMock.customer.create.mockResolvedValue(makeCustomer({ archivedAt: null }) as never);
    const dto = await createCustomer("c1", { name: "Ada" });
    expect(dto.archived).toBe(false);
    expect(typeof dto.createdAt).toBe("string");
    expect(dto.counts).toEqual({ leads: 0, invoices: 0, bookings: 0 });
  });

  it("maps archivedAt set → archived:true in DTO", async () => {
    prismaMock.customer.create.mockResolvedValue(makeCustomer({ archivedAt: NOW }) as never);
    const dto = await createCustomer("c1", { name: "Ada" });
    expect(dto.archived).toBe(true);
  });

  it("throws ZodError on invalid input (empty name)", async () => {
    await expect(createCustomer("c1", { name: "" })).rejects.toThrow();
    expect(prismaMock.customer.create).not.toHaveBeenCalled();
  });

  it("defaults source to 'manual' when not supplied", async () => {
    prismaMock.customer.create.mockResolvedValue(makeCustomer() as never);
    await createCustomer("c1", { name: "Ada" });
    expect(prismaMock.customer.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: "manual" }) }),
    );
  });
});

// ── listCustomers ─────────────────────────────────────────────────────────────

describe("listCustomers", () => {
  it("returns active customers by default (archivedAt: null)", async () => {
    prismaMock.customer.findMany.mockResolvedValue([]);
    await listCustomers("c1");
    expect(prismaMock.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ clientId: "c1", archivedAt: null }),
      }),
    );
  });

  it("returns only archived when opts.archived=true", async () => {
    prismaMock.customer.findMany.mockResolvedValue([]);
    await listCustomers("c1", { archived: true });
    expect(prismaMock.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ archivedAt: { not: null } }),
      }),
    );
  });

  it("adds OR search filter when search term is provided", async () => {
    prismaMock.customer.findMany.mockResolvedValue([]);
    await listCustomers("c1", { search: "ada" });
    const call = prismaMock.customer.findMany.mock.calls[0][0];
    expect(call.where).toHaveProperty("OR");
  });

  it("scopes to the correct clientId (tenant isolation)", async () => {
    prismaMock.customer.findMany.mockResolvedValue([makeCustomer({ clientId: "c2" }) as never]);
    await listCustomers("c2");
    expect(prismaMock.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ clientId: "c2" }) }),
    );
  });
});

// ── customerCounts ────────────────────────────────────────────────────────────

describe("customerCounts", () => {
  it("returns active and archived counts", async () => {
    prismaMock.customer.count
      .mockResolvedValueOnce(10) // active
      .mockResolvedValueOnce(3); // archived
    const result = await customerCounts("c1");
    expect(result).toEqual({ active: 10, archived: 3 });
  });
});

// ── getCustomer ───────────────────────────────────────────────────────────────

describe("getCustomer", () => {
  it("returns null when not found or not owned (IDOR guard)", async () => {
    prismaMock.customer.findFirst.mockResolvedValue(null);
    expect(await getCustomer("c1", "other-id")).toBeNull();
    expect(prismaMock.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "other-id", clientId: "c1" } }),
    );
  });

  it("returns the DTO when owned", async () => {
    prismaMock.customer.findFirst.mockResolvedValue(makeCustomer() as never);
    const dto = await getCustomer("c1", "cust1");
    expect(dto?.id).toBe("cust1");
  });
});

// ── updateCustomer ────────────────────────────────────────────────────────────

describe("updateCustomer", () => {
  it("throws CustomerError(not_found, 404) for wrong tenant", async () => {
    prismaMock.customer.findFirst.mockResolvedValue(null);
    await expect(updateCustomer("c1", "other-id", { name: "Bob" })).rejects.toThrow("not_found");
    expect(prismaMock.customer.update).not.toHaveBeenCalled();
  });

  it("updates and audits when owned", async () => {
    prismaMock.customer.findFirst.mockResolvedValue({ id: "cust1" } as never);
    prismaMock.customer.update.mockResolvedValue(makeCustomer({ name: "Bob" }) as never);
    const result = await updateCustomer("c1", "cust1", { name: "Bob" }, { userId: "u1" });
    expect(prismaMock.customer.update).toHaveBeenCalled();
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "customer.updated", clientId: "c1", entityId: "cust1", actorId: "u1" }),
    );
    expect(result.name).toBe("Bob");
  });

  it("throws ZodError for invalid update input", async () => {
    prismaMock.customer.findFirst.mockResolvedValue({ id: "cust1" } as never);
    await expect(updateCustomer("c1", "cust1", { email: "not-an-email" })).rejects.toThrow();
  });
});

// ── setCustomerArchived ───────────────────────────────────────────────────────

describe("setCustomerArchived", () => {
  it("throws not_found for wrong tenant", async () => {
    prismaMock.customer.findFirst.mockResolvedValue(null);
    await expect(setCustomerArchived("c1", "other-id", true)).rejects.toThrow("not_found");
  });

  it("sets archivedAt to a date when archiving", async () => {
    prismaMock.customer.findFirst.mockResolvedValue({ id: "cust1" } as never);
    prismaMock.customer.update.mockResolvedValue(makeCustomer({ archivedAt: NOW }) as never);
    await setCustomerArchived("c1", "cust1", true);
    expect(prismaMock.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ archivedAt: expect.any(Date) }) }),
    );
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "customer.archived" }));
  });

  it("sets archivedAt to null when unarchiving", async () => {
    prismaMock.customer.findFirst.mockResolvedValue({ id: "cust1" } as never);
    prismaMock.customer.update.mockResolvedValue(makeCustomer() as never);
    await setCustomerArchived("c1", "cust1", false);
    expect(prismaMock.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ archivedAt: null }) }),
    );
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "customer.unarchived" }));
  });
});

// ── deleteCustomer ────────────────────────────────────────────────────────────

describe("deleteCustomer", () => {
  it("throws not_found when customer is not owned", async () => {
    prismaMock.customer.findFirst.mockResolvedValue(null);
    await expect(deleteCustomer("c1", "other-id")).rejects.toThrow("not_found");
  });

  it("throws has_financial_records when invoices exist", async () => {
    prismaMock.customer.findFirst.mockResolvedValue({
      id: "cust1",
      _count: { invoices: 1, payments: 0, statements: 0 },
    } as never);
    await expect(deleteCustomer("c1", "cust1")).rejects.toThrow("has_financial_records");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("throws has_financial_records when payments exist", async () => {
    prismaMock.customer.findFirst.mockResolvedValue({
      id: "cust1",
      _count: { invoices: 0, payments: 2, statements: 0 },
    } as never);
    await expect(deleteCustomer("c1", "cust1")).rejects.toThrow("has_financial_records");
  });

  it("deletes in a transaction and audits when no financial records", async () => {
    prismaMock.customer.findFirst.mockResolvedValue({
      id: "cust1",
      _count: { invoices: 0, payments: 0, statements: 0 },
    } as never);
    // $transaction in array form resolves all promises
    prismaMock.lead.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.booking.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.conversation.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.accountBalance.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.customer.delete.mockResolvedValue({} as never);

    await deleteCustomer("c1", "cust1");
    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "customer.deleted" }));
  });
});

// ── mergeCustomers ────────────────────────────────────────────────────────────

describe("mergeCustomers", () => {
  it("throws same_customer when primaryId === duplicateId", async () => {
    await expect(mergeCustomers("c1", "cust1", "cust1")).rejects.toThrow("same_customer");
  });

  it("throws not_found when either customer is missing or not owned", async () => {
    prismaMock.customer.findFirst
      .mockResolvedValueOnce(null) // primary not found
      .mockResolvedValueOnce(makeCustomer({ id: "cust2" }) as never);
    await expect(mergeCustomers("c1", "cust1", "cust2")).rejects.toThrow("not_found");
  });

  it("throws not_found when duplicate is missing", async () => {
    prismaMock.customer.findFirst
      .mockResolvedValueOnce(makeCustomer() as never)
      .mockResolvedValueOnce(null); // dup not found
    await expect(mergeCustomers("c1", "cust1", "cust2")).rejects.toThrow("not_found");
  });

  it("runs a transaction and audits on success", async () => {
    const primary = makeCustomer({ id: "cust1", tags: ["vip"], customFields: null, note: "primary note" });
    const dup = makeCustomer({ id: "cust2", tags: ["new"], customFields: null, note: "dup note" });

    prismaMock.customer.findFirst
      .mockResolvedValueOnce(primary as never) // primary lookup
      .mockResolvedValueOnce(dup as never)    // dup lookup
      .mockResolvedValueOnce(primary as never); // final fresh fetch

    // Transaction is callback-form; mock tx operations
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => {
      // The tx mock passes the prismaMock itself as the tx proxy
      return fn(prismaMock as never);
    });
    prismaMock.lead.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.booking.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.invoice.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.payment.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.conversation.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.statement.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.customerNote.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.customerConsent.findMany.mockResolvedValue([]);
    prismaMock.accountBalance.findUnique.mockResolvedValue(null);
    prismaMock.customer.update.mockResolvedValue(primary as never);
    prismaMock.customer.delete.mockResolvedValue({} as never);

    await mergeCustomers("c1", "cust1", "cust2", { userId: "u1" });
    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "customer.merged",
        entityId: "cust1",
        metadata: expect.objectContaining({ mergedFrom: "cust2" }),
      }),
    );
  });

  it("merges tags (union, dedup)", async () => {
    const primary = makeCustomer({ id: "cust1", tags: ["vip", "repeat"], customFields: null, note: null });
    const dup = makeCustomer({ id: "cust2", tags: ["new", "vip"], customFields: null, note: null });

    prismaMock.customer.findFirst
      .mockResolvedValueOnce(primary as never)
      .mockResolvedValueOnce(dup as never)
      .mockResolvedValueOnce(primary as never);

    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock as never));
    prismaMock.lead.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.booking.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.invoice.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.payment.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.conversation.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.statement.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.customerNote.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.customerConsent.findMany.mockResolvedValue([]);
    prismaMock.accountBalance.findUnique.mockResolvedValue(null);
    prismaMock.customer.delete.mockResolvedValue({} as never);

    let capturedTags: string[] = [];
    prismaMock.customer.update.mockImplementation(async (args: { data: { tags?: string[] } }) => {
      if (args.data.tags) capturedTags = args.data.tags;
      return primary;
    });

    await mergeCustomers("c1", "cust1", "cust2");
    expect(capturedTags).toContain("vip");
    expect(capturedTags).toContain("repeat");
    expect(capturedTags).toContain("new");
    // "vip" should appear only once
    expect(capturedTags.filter((t) => t === "vip")).toHaveLength(1);
  });
});

// ── upsertCustomerFromLead ────────────────────────────────────────────────────

describe("upsertCustomerFromLead", () => {
  const lead = { id: "l1", clientId: "c1", name: "Ada", email: "ada@x.com", phone: null };

  it("returns null when lead has no email and no phone", async () => {
    const result = await upsertCustomerFromLead({ ...lead, email: null, phone: null });
    expect(result).toBeNull();
    expect(prismaMock.customer.findFirst).not.toHaveBeenCalled();
  });

  it("links lead to existing customer matched by email and un-archives them", async () => {
    prismaMock.customer.findFirst.mockResolvedValue({ id: "cust-existing" } as never);
    prismaMock.customer.update.mockResolvedValue({} as never);
    prismaMock.lead.update.mockResolvedValue({} as never);

    const result = await upsertCustomerFromLead(lead);
    expect(result).toBe("cust-existing");
    expect(prismaMock.customer.create).not.toHaveBeenCalled();
    // Should link the lead
    expect(prismaMock.lead.update).toHaveBeenCalledWith({ where: { id: "l1" }, data: { customerId: "cust-existing" } });
    // Should un-archive
    expect(prismaMock.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ archivedAt: null }) }),
    );
  });

  it("creates a new customer with source='website' when no match", async () => {
    prismaMock.customer.findFirst.mockResolvedValue(null);
    prismaMock.customer.create.mockResolvedValue({ id: "cust-new" } as never);
    prismaMock.lead.update.mockResolvedValue({} as never);

    const result = await upsertCustomerFromLead(lead);
    expect(result).toBe("cust-new");
    expect(prismaMock.customer.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: "website", clientId: "c1" }) }),
    );
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "customer.created", metadata: expect.objectContaining({ via: "lead" }) }),
    );
  });

  it("scopes lookup to the correct tenant (IDOR guard)", async () => {
    prismaMock.customer.findFirst.mockResolvedValue(null);
    prismaMock.customer.create.mockResolvedValue({ id: "cust-new" } as never);
    prismaMock.lead.update.mockResolvedValue({} as never);

    await upsertCustomerFromLead({ ...lead, clientId: "c99" });
    expect(prismaMock.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ clientId: "c99" }) }),
    );
  });

  it("matches by phone when email is absent", async () => {
    prismaMock.customer.findFirst.mockResolvedValue({ id: "cust-phone" } as never);
    prismaMock.customer.update.mockResolvedValue({} as never);
    prismaMock.lead.update.mockResolvedValue({} as never);

    const result = await upsertCustomerFromLead({ ...lead, email: null, phone: "555-9999" });
    expect(result).toBe("cust-phone");
  });
});
