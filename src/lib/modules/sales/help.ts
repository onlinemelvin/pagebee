import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/modules/audit";
import { appBase } from "@/lib/modules/email";
import { sendAdminHelpRequest } from "@/lib/modules/email/notifications";
import { SalesError } from "./errors";

/**
 * A rep asks for technical help. Routed to admins on BOTH channels: a persistent in-app ticket
 * (the admin Help inbox) and an email. Optionally tied to a specific preview for context. Fail-soft
 * on the email — the ticket is the source of truth.
 */
export async function createHelpRequest(
  repId: string,
  input: { message: string; previewId?: string },
  actor?: { userId?: string },
) {
  const message = (input.message ?? "").trim();
  if (!message) throw new SalesError("no_content", 400);

  const emp = await prisma.employee.findUnique({
    where: { id: repId },
    select: { user: { select: { name: true, email: true } } },
  });

  let prospectId: string | null = null;
  let previewUrl: string | undefined;
  if (input.previewId) {
    const preview = await prisma.preview.findFirst({
      where: { id: input.previewId, assignedSalesRepId: repId },
      select: { id: true, prospectId: true, publicToken: true },
    });
    if (preview) {
      prospectId = preview.prospectId ?? null;
      previewUrl = preview.publicToken ? `${appBase()}/p/${preview.publicToken}` : undefined;
    }
  }

  const req = await prisma.helpRequest.create({
    data: {
      employeeId: repId,
      repName: emp?.user?.name ?? null,
      previewId: input.previewId ?? null,
      prospectId,
      message,
    },
  });

  // Surface the request on the prospect's timeline when it's tied to one (fail-soft —
  // the ticket is the source of truth and must not fail on a timeline write).
  if (prospectId) {
    await prisma.prospectActivity
      .create({
        data: { prospectId, type: "note", summary: `Technical help requested: ${message}`, createdById: actor?.userId ?? null },
      })
      .catch(() => {});
  }

  await sendAdminHelpRequest({
    repName: emp?.user?.name ?? "A sales rep",
    repEmail: emp?.user?.email ?? null,
    message,
    previewUrl,
    inboxUrl: `${appBase()}/admin/help`,
  }).catch((e) => console.error("[rep/help] admin email failed", e));

  await writeAudit({ action: "rep.help_requested", entityType: "HelpRequest", entityId: req.id, actorId: actor?.userId ?? null, metadata: { repId } });
  return { ok: true as const, id: req.id };
}

export interface HelpRequestRow {
  id: string;
  repName: string | null;
  message: string;
  previewId: string | null;
  status: string;
  createdAt: Date;
  resolvedAt: Date | null;
}

/** Admin: all help tickets, open first then newest. */
export async function listHelpRequests(): Promise<HelpRequestRow[]> {
  return prisma.helpRequest.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: { id: true, repName: true, message: true, previewId: true, status: true, createdAt: true, resolvedAt: true },
  });
}

/** Admin badge count of open tickets. */
export async function countOpenHelpRequests(): Promise<number> {
  return prisma.helpRequest.count({ where: { status: "OPEN" } });
}

/** Admin: mark a ticket resolved. */
export async function resolveHelpRequest(id: string, actor?: { userId?: string }) {
  await prisma.helpRequest.update({ where: { id }, data: { status: "RESOLVED", resolvedAt: new Date() } }).catch(() => {
    throw new SalesError("help_request_not_found", 404);
  });
  await writeAudit({ action: "rep.help_resolved", entityType: "HelpRequest", entityId: id, actorId: actor?.userId ?? null });
  return { ok: true as const };
}
