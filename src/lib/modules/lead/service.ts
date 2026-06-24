import { prisma } from "@/lib/db";
import type { LeadStatus, Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/modules/audit";
import { emit } from "@/lib/events";
import { sendEmail, escapeHtml } from "@/lib/modules/email";
import {
  goalToLeadType,
  goalToCtaLabel,
  goalToFormBlurb,
  goalToMessagePrompt,
  type LeadFormMeta,
} from "@/lib/site/lead-goals";
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

/**
 * Whether the lead-capture form is live for a tenant. True only when the plan includes `contactForm`
 * AND the owner hasn't turned it off via the feature card. Default-on: with no override row, an
 * on-plan client is enabled (matches the feature catalog's `defaultOn: true` for "forms"). Used by
 * the public form-status feed (live show/hide on the site) and to gate public submissions.
 */
/**
 * `planOverride` (used when serving a PREVIEW generated at a different tier): gate against those
 * flags instead of the client's paid plan, and when `showcase` (previewing a HIGHER tier) show the
 * form regardless of the owner's toggle so the preview demonstrates the capability. Live serving
 * passes no override and keeps the paid-plan + opt-in behavior.
 */
export async function leadCaptureEnabled(
  clientId: string,
  planOverride?: { flags: Record<string, unknown>; showcase: boolean },
): Promise<boolean> {
  const override = await prisma.featureFlag.findUnique({
    where: { clientId_key: { clientId, key: "contactForm" } },
    select: { enabled: true },
  });
  let planFlags = planOverride?.flags;
  if (!planFlags) {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { subscription: { select: { plan: { select: { featureFlags: true } } } } },
    });
    planFlags = (client?.subscription?.plan.featureFlags ?? {}) as Record<string, unknown>;
  }
  if (!planFlags.contactForm) return false; // not on this (previewed or paid) plan
  if (planOverride?.showcase) return true; // previewing a higher tier — showcase the capability
  return override?.enabled !== false; // default-on unless explicitly disabled
}

/**
 * The goal-derived lead-form state for a tenant: whether the form is live, plus the CTA label, lead
 * type, and form copy implied by the owner's chosen goal (Website.leadFormGoal). Shared by the public
 * lead-form endpoint (reconcile) and the serve pipeline (inlined for flicker-free first paint).
 */
export async function getLeadFormMeta(
  clientId: string,
  planOverride?: { flags: Record<string, unknown>; showcase: boolean },
): Promise<LeadFormMeta> {
  const [web, enabled] = await Promise.all([
    prisma.website.findFirst({ where: { clientId }, select: { leadFormGoal: true } }),
    leadCaptureEnabled(clientId, planOverride),
  ]);
  const goal = web?.leadFormGoal;
  return {
    enabled,
    ctaLabel: goalToCtaLabel(goal),
    leadType: goalToLeadType(goal),
    formBlurb: goalToFormBlurb(goal),
    messagePrompt: goalToMessagePrompt(goal),
  };
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

/** Update a lead's status / assignment, with an audit entry. Pass `clientId` from a tenant context
 *  to scope the update to that tenant (IDOR backstop); omit it for cross-tenant admin updates. */
export async function updateLead(
  id: string,
  data: LeadUpdateInput,
  actor?: { userId?: string },
  clientId?: string,
) {
  if (clientId !== undefined) {
    const owned = await prisma.lead.findFirst({ where: { id, clientId }, select: { id: true } });
    if (!owned) throw new Error("lead_not_found"); // fail-closed: never update another tenant's lead
  }
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
