import { prisma } from "@/lib/db";
import { z } from "zod";
import { writeAudit } from "@/lib/modules/audit";

// Client-facing support tickets. Every query is scoped by clientId (tenant
// isolation): a client only ever sees and mutates its own tickets, and only
// client-visible comments (internal admin notes are hidden from the client).

export class SupportError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

export const createTicketSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(1).max(5000),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
});

export const addCommentSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

/** List the client's own tickets (newest first). */
export function listTickets(clientId: string) {
  return prisma.supportTicket.findMany({
    where: { clientId },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { id: true, subject: true, status: true, priority: true, createdAt: true, updatedAt: true, resolvedAt: true },
  });
}

/** One ticket with its client-visible comments — scoped to the owning client. */
export async function getTicket(clientId: string, id: string) {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id, clientId },
    select: {
      id: true, subject: true, body: true, status: true, priority: true, createdAt: true, updatedAt: true, resolvedAt: true,
      comments: {
        where: { internal: false }, // never expose internal admin notes to the client
        orderBy: { createdAt: "asc" },
        select: { id: true, body: true, authorId: true, createdAt: true },
      },
    },
  });
  if (!ticket) throw new SupportError(404, "not_found");
  return ticket;
}

/** Open a new support ticket for the client. */
export async function createTicket(clientId: string, openedById: string, input: unknown) {
  const { subject, body, priority } = createTicketSchema.parse(input);
  const ticket = await prisma.supportTicket.create({
    data: { clientId, openedById, subject, body, priority: priority ?? "NORMAL" },
    select: { id: true, subject: true, status: true, priority: true, createdAt: true },
  });
  await writeAudit({ action: "support.ticket_opened", entityType: "SupportTicket", entityId: ticket.id, clientId });
  return ticket;
}

/** Add a client-visible comment to one of the client's own tickets. */
export async function addComment(clientId: string, ticketId: string, authorId: string, input: unknown) {
  const { body } = addCommentSchema.parse(input);
  // Ownership check before writing the child row (tenant isolation).
  const ticket = await prisma.supportTicket.findFirst({ where: { id: ticketId, clientId }, select: { id: true, status: true } });
  if (!ticket) throw new SupportError(404, "not_found");
  if (ticket.status === "CLOSED") throw new SupportError(409, "ticket_closed");

  const comment = await prisma.ticketComment.create({
    data: { ticketId, authorId, body, internal: false },
    select: { id: true, body: true, authorId: true, createdAt: true },
  });
  // A client reply moves the ball to the admin and reopens a resolved ticket.
  await prisma.supportTicket.update({
    where: { id: ticketId },
    data: { status: ticket.status === "RESOLVED" ? "OPEN" : "WAITING_ON_ADMIN", updatedAt: new Date() },
  });
  return comment;
}
