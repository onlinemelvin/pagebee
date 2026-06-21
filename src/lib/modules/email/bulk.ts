import { prisma } from "@/lib/db";
import type { EmailCategory, CampaignStatus, PlanName, Prisma } from "@prisma/client";
import { dispatch } from "./dispatch";
import { isMarketing } from "./categories";

export class CampaignError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

// — Segments ------------------------------------------------------------------

export interface Segment {
  plans?: string[]; // PlanName[] — e.g. ["LAUNCH","CONNECT"]
  statuses?: string[]; // Client.status — e.g. ["active"]
  includeTest?: boolean; // include @test.com / isTest accounts (default false)
}

export interface SegmentRecipient {
  clientId: string;
  email: string;
  businessName: string;
}

/** Resolve a segment to its concrete recipients (one per client owner email). */
export async function resolveSegment(segment: Segment): Promise<SegmentRecipient[]> {
  const where: Prisma.ClientWhereInput = {};
  if (!segment.includeTest) where.isTest = false;
  if (segment.statuses?.length) where.status = { in: segment.statuses };
  if (segment.plans?.length) where.subscription = { plan: { name: { in: segment.plans as PlanName[] } } };

  const clients = await prisma.client.findMany({
    where,
    select: { id: true, businessName: true, ownerEmail: true, users: { where: { role: "owner" }, select: { user: { select: { email: true } } }, take: 1 } },
  });

  const out: SegmentRecipient[] = [];
  const seen = new Set<string>();
  for (const c of clients) {
    const email = (c.ownerEmail ?? c.users[0]?.user.email)?.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push({ clientId: c.id, email, businessName: c.businessName });
  }
  return out;
}

/** Recipient count for a segment — used to preview a campaign before sending. */
export async function segmentCount(segment: Segment): Promise<number> {
  return (await resolveSegment(segment)).length;
}

// — Campaigns -----------------------------------------------------------------

export interface CampaignInput {
  name: string;
  subject: string;
  bodyHtml: string;
  category: EmailCategory;
  segment: Segment;
  scheduledAt?: Date | null;
  createdBy?: string | null;
}

export async function createCampaign(input: CampaignInput) {
  return prisma.emailCampaign.create({
    data: {
      name: input.name,
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      category: input.category,
      segment: input.segment as unknown as Prisma.InputJsonValue,
      status: input.scheduledAt ? "SCHEDULED" : "DRAFT",
      scheduledAt: input.scheduledAt ?? null,
      createdBy: input.createdBy ?? null,
    },
  });
}

export async function updateCampaign(id: string, input: Partial<CampaignInput>) {
  const c = await prisma.emailCampaign.findUnique({ where: { id }, select: { status: true } });
  if (!c) throw new CampaignError(404, "not_found");
  if (c.status === "SENDING" || c.status === "SENT") throw new CampaignError(409, "already_sent");
  return prisma.emailCampaign.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.subject !== undefined ? { subject: input.subject } : {}),
      ...(input.bodyHtml !== undefined ? { bodyHtml: input.bodyHtml } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.segment !== undefined ? { segment: input.segment as unknown as Prisma.InputJsonValue } : {}),
      ...(input.scheduledAt !== undefined ? { scheduledAt: input.scheduledAt, status: input.scheduledAt ? "SCHEDULED" : "DRAFT" } : {}),
    },
  });
}

export function listCampaigns(status?: CampaignStatus) {
  return prisma.emailCampaign.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export function getCampaign(id: string) {
  return prisma.emailCampaign.findUnique({ where: { id } });
}

export async function cancelCampaign(id: string) {
  const c = await prisma.emailCampaign.findUnique({ where: { id }, select: { status: true } });
  if (!c) throw new CampaignError(404, "not_found");
  if (c.status === "SENT" || c.status === "SENDING") throw new CampaignError(409, "already_sent");
  return prisma.emailCampaign.update({ where: { id }, data: { status: "CANCELLED" } });
}

/**
 * Send a campaign to its whole segment now. Claims the campaign (DRAFT/SCHEDULED
 * → SENDING) atomically so a concurrent worker tick or admin click can't send it
 * twice, then dispatches one email per recipient through the normal pipeline
 * (suppression + EmailLog + branded layout all apply).
 */
export async function sendCampaign(id: string): Promise<{ sent: number; suppressed: number; failed: number }> {
  const claimed = await prisma.emailCampaign.updateMany({
    where: { id, status: { in: ["DRAFT", "SCHEDULED"] } },
    data: { status: "SENDING" },
  });
  if (claimed.count !== 1) throw new CampaignError(409, "not_sendable");

  const campaign = await prisma.emailCampaign.findUniqueOrThrow({ where: { id } });
  const segment = campaign.segment as unknown as Segment;
  const recipients = await resolveSegment(segment);

  let sent = 0;
  let suppressed = 0;
  let failed = 0;
  for (const r of recipients) {
    const res = await dispatch({
      to: r.email,
      subject: campaign.subject,
      body: campaign.bodyHtml,
      category: campaign.category,
      template: `campaign:${campaign.id}`,
      clientId: r.clientId,
      recipientLabel: r.businessName,
      campaignId: campaign.id,
    });
    if (res.status === "SENT" || res.status === "STUBBED") sent++;
    else if (res.status === "SUPPRESSED") suppressed++;
    else failed++;
  }

  await prisma.emailCampaign.update({
    where: { id },
    data: { status: "SENT", sentAt: new Date(), totalRecipients: recipients.length, sentCount: sent, failedCount: failed },
  });
  return { sent, suppressed, failed };
}

/** Warn callers building marketing campaigns whether the chosen category is suppressible. */
export const categoryIsMarketing = isMarketing;

// — Reusable templates --------------------------------------------------------

export interface TemplateInput {
  name: string;
  subject: string;
  bodyHtml: string;
  category: EmailCategory;
  createdBy?: string | null;
}

export function listTemplates() {
  return prisma.emailTemplate.findMany({ orderBy: { updatedAt: "desc" } });
}

export function getTemplate(id: string) {
  return prisma.emailTemplate.findUnique({ where: { id } });
}

export async function createTemplate(input: TemplateInput) {
  const exists = await prisma.emailTemplate.findUnique({ where: { name: input.name }, select: { id: true } });
  if (exists) throw new CampaignError(409, "name_taken");
  return prisma.emailTemplate.create({ data: { ...input, createdBy: input.createdBy ?? null } });
}

export function updateTemplate(id: string, input: Partial<TemplateInput>) {
  return prisma.emailTemplate.update({ where: { id }, data: input });
}

export function deleteTemplate(id: string) {
  return prisma.emailTemplate.delete({ where: { id } });
}
