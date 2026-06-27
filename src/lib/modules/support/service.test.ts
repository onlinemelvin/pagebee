import { describe, it, expect, vi } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));

import { listTickets, getTicket, createTicket, addComment, SupportError } from "./service";
import { writeAudit } from "@/lib/modules/audit";

describe("listTickets", () => {
  it("scopes by clientId and returns newest first", async () => {
    prismaMock.supportTicket.findMany.mockResolvedValue([]);
    await listTickets("c1");
    expect(prismaMock.supportTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: "c1" }, orderBy: { updatedAt: "desc" } }),
    );
  });
});

describe("getTicket", () => {
  it("throws SupportError 404 when ticket not found for client", async () => {
    prismaMock.supportTicket.findFirst.mockResolvedValue(null);
    await expect(getTicket("c1", "t1")).rejects.toThrow("not_found");
  });

  it("returns ticket scoped to clientId (never exposes another tenant's ticket)", async () => {
    const ticket = { id: "t1", subject: "Help", body: "...", status: "OPEN", priority: "NORMAL", createdAt: new Date(), updatedAt: new Date(), resolvedAt: null, comments: [] };
    prismaMock.supportTicket.findFirst.mockResolvedValue(ticket as never);
    const result = await getTicket("c1", "t1");
    expect(result).toBe(ticket);
    // must pass clientId in the where clause (tenant scoping)
    expect(prismaMock.supportTicket.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "t1", clientId: "c1" } }),
    );
  });

  it("excludes internal comments from the query", async () => {
    prismaMock.supportTicket.findFirst.mockResolvedValue({ id: "t1", comments: [] } as never);
    await getTicket("c1", "t1");
    const call = prismaMock.supportTicket.findFirst.mock.calls[0][0] as { select?: { comments?: { where?: unknown } } };
    // The comments sub-select filters internal: false
    expect(call.select?.comments?.where).toEqual({ internal: false });
  });
});

describe("createTicket", () => {
  it("persists with correct clientId and audits", async () => {
    const ticket = { id: "t1", subject: "Issue", status: "OPEN", priority: "NORMAL", createdAt: new Date() };
    prismaMock.supportTicket.create.mockResolvedValue(ticket as never);

    const result = await createTicket("c1", "u1", { subject: "Issue", body: "details here" });

    expect(result).toBe(ticket);
    expect(prismaMock.supportTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ clientId: "c1", openedById: "u1", subject: "Issue" }),
      }),
    );
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "support.ticket_opened", clientId: "c1", entityId: "t1" }),
    );
  });

  it("defaults priority to NORMAL when not provided", async () => {
    prismaMock.supportTicket.create.mockResolvedValue({ id: "t2" } as never);
    await createTicket("c1", "u1", { subject: "Test issue", body: "body text here" });
    expect(prismaMock.supportTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ priority: "NORMAL" }) }),
    );
  });

  it("respects an explicit priority", async () => {
    prismaMock.supportTicket.create.mockResolvedValue({ id: "t3" } as never);
    await createTicket("c1", "u1", { subject: "Urgent issue!", body: "something broke", priority: "URGENT" });
    expect(prismaMock.supportTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ priority: "URGENT" }) }),
    );
  });

  it("throws a zod validation error when subject is too short", async () => {
    await expect(createTicket("c1", "u1", { subject: "ab", body: "body text" })).rejects.toThrow();
    expect(prismaMock.supportTicket.create).not.toHaveBeenCalled();
  });
});

describe("addComment", () => {
  it("throws 404 when ticket not found for client (tenant isolation)", async () => {
    prismaMock.supportTicket.findFirst.mockResolvedValue(null);
    await expect(addComment("c1", "t1", "u1", { body: "comment here" })).rejects.toThrow("not_found");
    expect(prismaMock.ticketComment.create).not.toHaveBeenCalled();
  });

  it("throws 409 when ticket is CLOSED", async () => {
    prismaMock.supportTicket.findFirst.mockResolvedValue({ id: "t1", status: "CLOSED" } as never);
    await expect(addComment("c1", "t1", "u1", { body: "comment here" })).rejects.toThrow("ticket_closed");
    expect(prismaMock.ticketComment.create).not.toHaveBeenCalled();
  });

  it("creates comment with internal: false", async () => {
    prismaMock.supportTicket.findFirst.mockResolvedValue({ id: "t1", status: "OPEN" } as never);
    prismaMock.ticketComment.create.mockResolvedValue({ id: "c1", body: "hello", authorId: "u1", createdAt: new Date() } as never);
    prismaMock.supportTicket.update.mockResolvedValue({} as never);

    await addComment("c1", "t1", "u1", { body: "hello" });

    expect(prismaMock.ticketComment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ internal: false, ticketId: "t1", authorId: "u1" }) }),
    );
  });

  it("moves OPEN ticket to WAITING_ON_ADMIN after client reply", async () => {
    prismaMock.supportTicket.findFirst.mockResolvedValue({ id: "t1", status: "OPEN" } as never);
    prismaMock.ticketComment.create.mockResolvedValue({ id: "c1" } as never);
    prismaMock.supportTicket.update.mockResolvedValue({} as never);

    await addComment("c1", "t1", "u1", { body: "still broken" });

    expect(prismaMock.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "WAITING_ON_ADMIN" }) }),
    );
  });

  it("reopens a RESOLVED ticket to OPEN on client reply", async () => {
    prismaMock.supportTicket.findFirst.mockResolvedValue({ id: "t1", status: "RESOLVED" } as never);
    prismaMock.ticketComment.create.mockResolvedValue({ id: "c1" } as never);
    prismaMock.supportTicket.update.mockResolvedValue({} as never);

    await addComment("c1", "t1", "u1", { body: "still not fixed" });

    expect(prismaMock.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "OPEN" }) }),
    );
  });
});
