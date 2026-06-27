import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/modules/audit";
import { SalesError } from "./errors";
import { normalizeDedupeKey } from "./dedupe";
import {
  prospectInputSchema,
  prospectUpdateSchema,
  activityInputSchema,
  callNoteInputSchema,
  followUpInputSchema,
} from "./schema";

/**
 * Prospect CRM, scoped to a single sales rep. Every function takes `repId` (the rep's `Employee.id`,
 * resolved from the session by `requireRep` — never the request body) and refuses to touch a prospect
 * the rep isn't assigned to. This is the rep-portal isolation boundary, the sales analogue of tenant
 * isolation. See docs/INTERNAL_OPS.md §2.
 */

const PROSPECT_INCLUDE = {
  assignments: { select: { employeeId: true } },
  _count: { select: { activities: true, callNotes: true, followUps: true, quotes: true } },
} as const;

/** Throws 404 unless `repId` is assigned to `prospectId` (fail-closed IDOR backstop). */
async function assertAssigned(repId: string, prospectId: string): Promise<void> {
  const link = await prisma.salesAssignment.findFirst({
    where: { prospectId, employeeId: repId },
    select: { id: true },
  });
  if (!link) throw new SalesError("prospect_not_found", 404);
}

/**
 * Add a prospect for a rep. Enforces first-touch dedup: if a prospect with the same normalized
 * fingerprint already exists, the rep may re-open their *own*, but a prospect already claimed by
 * another rep is rejected (409) rather than silently double-credited.
 */
export async function createProspect(repId: string, input: unknown, actor?: { userId?: string }) {
  const parsed = prospectInputSchema.parse(input);
  const dedupeKey = normalizeDedupeKey({
    businessName: parsed.businessName,
    phone: parsed.phone,
    email: parsed.email,
  });

  const existing = await prisma.prospect.findFirst({
    where: { dedupeKey },
    include: { assignments: { select: { employeeId: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    const owners = existing.assignments.map((a) => a.employeeId);
    if (owners.length && !owners.includes(repId)) {
      throw new SalesError("prospect_claimed", 409); // first-touch lock — another rep owns it
    }
    return existing; // already the rep's own — idempotent re-add
  }

  const prospect = await prisma.prospect.create({
    data: {
      businessName: parsed.businessName,
      contactName: parsed.contactName,
      email: parsed.email,
      phone: parsed.phone,
      businessType: parsed.businessType,
      source: parsed.source ?? "rep",
      notes: parsed.notes,
      dedupeKey,
      assignments: { create: { employeeId: repId } },
    },
    include: PROSPECT_INCLUDE,
  });

  await writeAudit({
    action: "prospect.created",
    entityType: "Prospect",
    entityId: prospect.id,
    actorId: actor?.userId ?? null,
    metadata: { repId },
  });
  return prospect;
}

/** List the rep's own prospects, newest first, optional text search + status filter. */
export async function listProspects(
  repId: string,
  opts: { search?: string; status?: string } = {},
) {
  const search = opts.search?.trim();
  return prisma.prospect.findMany({
    where: {
      assignments: { some: { employeeId: repId } },
      ...(opts.status ? { status: opts.status } : {}),
      ...(search
        ? {
            OR: [
              { businessName: { contains: search, mode: "insensitive" } },
              { contactName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    },
    include: PROSPECT_INCLUDE,
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
}

/** A single prospect with its full timeline, scoped to the rep. Throws 404 if not theirs. */
export async function getProspect(repId: string, prospectId: string) {
  await assertAssigned(repId, prospectId);
  return prisma.prospect.findUnique({
    where: { id: prospectId },
    include: {
      activities: { orderBy: { createdAt: "desc" }, take: 100 },
      callNotes: { orderBy: { createdAt: "desc" }, take: 100 },
      followUps: { orderBy: { dueAt: "asc" }, take: 100 },
      quotes: { orderBy: { createdAt: "desc" } },
    },
  });
}

/** Update a prospect's fields/status, scoped to the rep. */
export async function updateProspect(
  repId: string,
  prospectId: string,
  input: unknown,
  actor?: { userId?: string },
) {
  await assertAssigned(repId, prospectId);
  const parsed = prospectUpdateSchema.parse(input);
  const prospect = await prisma.prospect.update({
    where: { id: prospectId },
    data: {
      ...(parsed.businessName !== undefined ? { businessName: parsed.businessName } : {}),
      ...(parsed.contactName !== undefined ? { contactName: parsed.contactName } : {}),
      ...(parsed.email !== undefined ? { email: parsed.email } : {}),
      ...(parsed.phone !== undefined ? { phone: parsed.phone } : {}),
      ...(parsed.businessType !== undefined ? { businessType: parsed.businessType } : {}),
      ...(parsed.source !== undefined ? { source: parsed.source } : {}),
      ...(parsed.notes !== undefined ? { notes: parsed.notes } : {}),
      ...(parsed.status !== undefined ? { status: parsed.status } : {}),
    },
    include: PROSPECT_INCLUDE,
  });
  await writeAudit({
    action: "prospect.updated",
    entityType: "Prospect",
    entityId: prospectId,
    actorId: actor?.userId ?? null,
    metadata: { repId, status: parsed.status ?? null },
  });
  return prospect;
}

/** Log a timeline activity (call/email/meeting/note) on the rep's prospect. */
export async function logActivity(
  repId: string,
  prospectId: string,
  input: unknown,
  actor?: { userId?: string },
) {
  await assertAssigned(repId, prospectId);
  const parsed = activityInputSchema.parse(input);
  return prisma.prospectActivity.create({
    data: {
      prospectId,
      type: parsed.type,
      summary: parsed.summary,
      createdById: actor?.userId ?? null,
    },
  });
}

/** Record a call note + outcome on the rep's prospect. */
export async function addCallNote(
  repId: string,
  prospectId: string,
  input: unknown,
  actor?: { userId?: string },
) {
  await assertAssigned(repId, prospectId);
  const parsed = callNoteInputSchema.parse(input);
  return prisma.callNote.create({
    data: {
      prospectId,
      outcome: parsed.outcome,
      note: parsed.note,
      createdById: actor?.userId ?? null,
    },
  });
}

/** Schedule a follow-up on the rep's prospect; the rep is the assignee (drives reminders). */
export async function scheduleFollowUp(repId: string, prospectId: string, input: unknown) {
  await assertAssigned(repId, prospectId);
  const parsed = followUpInputSchema.parse(input);
  return prisma.followUp.create({
    data: {
      prospectId,
      dueAt: parsed.dueAt,
      note: parsed.note,
      assignedToId: repId,
    },
  });
}

/** The rep's follow-ups, optionally only those due on/before a cutoff and not yet completed. */
export async function listFollowUps(
  repId: string,
  opts: { dueBefore?: Date; includeCompleted?: boolean } = {},
) {
  return prisma.followUp.findMany({
    where: {
      assignedToId: repId,
      ...(opts.includeCompleted ? {} : { completed: false }),
      ...(opts.dueBefore ? { dueAt: { lte: opts.dueBefore } } : {}),
    },
    include: { prospect: { select: { id: true, businessName: true } } },
    orderBy: { dueAt: "asc" },
    take: 200,
  });
}

/** Mark a follow-up done. Scoped: only the assigned rep may complete it. */
export async function completeFollowUp(repId: string, followUpId: string) {
  const owned = await prisma.followUp.findFirst({
    where: { id: followUpId, assignedToId: repId },
    select: { id: true },
  });
  if (!owned) throw new SalesError("follow_up_not_found", 404);
  return prisma.followUp.update({ where: { id: followUpId }, data: { completed: true } });
}
