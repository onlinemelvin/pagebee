import { prisma } from "@/lib/db";
import type { LeadStatus, Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/modules/audit";
import { emit } from "@/lib/events";
import { sendEmail, escapeHtml } from "@/lib/modules/email";
import type { LeadInput, LeadUpdateInput } from "./schema";

export interface CreateLeadParams {
  clientId: string; // resolved from the site token — never trusted from the body
  input: LeadInput;
  ip?: string | null;
}

/**
 * Create a lead for a tenant. Persists, writes an audit entry, and emits
 * `lead.created` (which fans out to owner notification, analytics, etc.).
 */
export async function createLead({ clientId, input, ip }: CreateLeadParams) {
  const lead = await prisma.lead.create({
    data: {
      clientId,
      type: input.type,
      name: input.name,
      email: input.email,
      phone: input.phone,
      message: input.message,
      source: input.source,
    },
  });

  await writeAudit({
    action: "lead.created",
    entityType: "Lead",
    entityId: lead.id,
    clientId,
    ip,
  });

  await emit("lead.created", { lead });

  return lead;
}

/** List leads, optionally scoped to a tenant and/or filtered by status (admin/client dashboards). */
export async function listLeads(opts: { clientId?: string; status?: LeadStatus } = {}) {
  return prisma.lead.findMany({
    where: {
      ...(opts.clientId ? { clientId: opts.clientId } : {}),
      ...(opts.status ? { status: opts.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

/** Update a lead's status / assignment, with an audit entry. */
export async function updateLead(
  id: string,
  data: LeadUpdateInput,
  actor?: { userId?: string },
) {
  const lead = await prisma.lead.update({
    where: { id },
    data: {
      ...(data.status ? { status: data.status } : {}),
      ...(data.assignedToId !== undefined ? { assignedToId: data.assignedToId } : {}),
    },
  });

  await writeAudit({
    action: "lead.updated",
    entityType: "Lead",
    entityId: lead.id,
    clientId: lead.clientId,
    actorId: actor?.userId ?? null,
    metadata: {
      status: data.status ?? null,
      assignedToId: data.assignedToId ?? null,
    } satisfies Prisma.InputJsonValue,
  });

  return lead;
}

/** Send an email reply to a lead from the client owner; marks the lead CONTACTED. */
export async function replyToLead(clientId: string, leadId: string, message: string) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, clientId } });
  if (!lead) throw new Error("lead_not_found");
  if (!lead.email) throw new Error("lead_no_email");

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { businessName: true, ownerEmail: true },
  });

  await sendEmail({
    to: lead.email,
    subject: `Re: your inquiry to ${client?.businessName ?? "us"}`,
    html: `<p>${escapeHtml(message).replace(/\n/g, "<br/>")}</p><p>— ${escapeHtml(client?.businessName ?? "")}</p>`,
    replyTo: client?.ownerEmail ?? undefined,
  });

  if (lead.status === "NEW") {
    await prisma.lead.update({ where: { id: leadId }, data: { status: "CONTACTED" } });
  }
  await writeAudit({ action: "lead.replied", entityType: "Lead", entityId: leadId, clientId });
  return { ok: true };
}
