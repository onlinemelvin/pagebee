import { prisma } from "@/lib/db";
import type { Customer, Lead, Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/modules/audit";
import {
  customerInputSchema,
  customerUpdateSchema,
  type CustomerInput,
  type CustomerUpdate,
  type CustomField,
} from "./schema";

// Thrown for caller-correctable problems so API routes can map them to a status + message.
export class CustomerError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
    this.name = "CustomerError";
  }
}

export interface CustomerDTO {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  address: string | null;
  note: string | null;
  tags: string[];
  customFields: CustomField[];
  source: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  counts: { leads: number; invoices: number; bookings: number };
}

type CustomerWithCounts = Customer & {
  _count?: { leads: number; invoices: number; bookings: number };
};

function parseCustomFields(value: Prisma.JsonValue | null): CustomField[] {
  if (!Array.isArray(value)) return [];
  const out: CustomField[] = [];
  for (const f of value) {
    if (f && typeof f === "object" && !Array.isArray(f)) {
      const rec = f as Record<string, unknown>;
      const label = String(rec.label ?? "");
      if (label) out.push({ label, value: String(rec.value ?? "") });
    }
  }
  return out;
}

function toDTO(c: CustomerWithCounts): CustomerDTO {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    company: c.company,
    address: c.address,
    note: c.note,
    tags: c.tags ?? [],
    customFields: parseCustomFields(c.customFields),
    source: c.source,
    archived: c.archivedAt != null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    counts: {
      leads: c._count?.leads ?? 0,
      invoices: c._count?.invoices ?? 0,
      bookings: c._count?.bookings ?? 0,
    },
  };
}

const COUNT_SELECT = { _count: { select: { leads: true, invoices: true, bookings: true } } } as const;

/** Map validated input → Prisma columns (customFields stored as a JSON array; tags as text[]). */
function toData(input: CustomerInput | CustomerUpdate) {
  const data: Prisma.CustomerUncheckedUpdateInput = {};
  if ("name" in input && input.name !== undefined) data.name = input.name;
  if ("email" in input) data.email = input.email ?? null;
  if ("phone" in input) data.phone = input.phone ?? null;
  if ("company" in input) data.company = input.company ?? null;
  if ("address" in input) data.address = input.address ?? null;
  if ("note" in input) data.note = input.note ?? null;
  if ("source" in input) data.source = input.source ?? null;
  if ("tags" in input && input.tags !== undefined) data.tags = input.tags;
  if ("customFields" in input && input.customFields !== undefined) {
    data.customFields = input.customFields as unknown as Prisma.InputJsonValue;
  }
  return data;
}

/** Create a contact for a tenant. */
export async function createCustomer(
  clientId: string,
  input: unknown,
  actor?: { userId?: string },
): Promise<CustomerDTO> {
  const parsed = customerInputSchema.parse(input);
  const customer = await prisma.customer.create({
    data: {
      clientId,
      name: parsed.name,
      email: parsed.email ?? null,
      phone: parsed.phone ?? null,
      company: parsed.company ?? null,
      address: parsed.address ?? null,
      note: parsed.note ?? null,
      tags: parsed.tags ?? [],
      customFields: (parsed.customFields ?? []) as unknown as Prisma.InputJsonValue,
      source: parsed.source ?? "manual",
    },
    include: COUNT_SELECT,
  });
  await writeAudit({ action: "customer.created", entityType: "Customer", entityId: customer.id, clientId, actorId: actor?.userId ?? null });
  return toDTO(customer);
}

/**
 * List a tenant's contacts, newest first, with relation counts. `archived` selects WHICH set:
 * false/undefined → only active (not archived); true → only archived. Optional text search.
 */
export async function listCustomers(
  clientId: string,
  opts: { search?: string; archived?: boolean } = {},
): Promise<CustomerDTO[]> {
  const search = opts.search?.trim();
  const rows = await prisma.customer.findMany({
    where: {
      clientId,
      ...(opts.archived ? { archivedAt: { not: null } } : { archivedAt: null }),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
              { company: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: COUNT_SELECT,
  });
  return rows.map(toDTO);
}

/** Counts for the list header (total active + archived). */
export async function customerCounts(clientId: string): Promise<{ active: number; archived: number }> {
  const [active, archived] = await Promise.all([
    prisma.customer.count({ where: { clientId, archivedAt: null } }),
    prisma.customer.count({ where: { clientId, archivedAt: { not: null } } }),
  ]);
  return { active, archived };
}

/** One contact (tenant-scoped). Returns null if not found / not owned. */
export async function getCustomer(clientId: string, id: string): Promise<CustomerDTO | null> {
  const c = await prisma.customer.findFirst({ where: { id, clientId }, include: COUNT_SELECT });
  return c ? toDTO(c) : null;
}

/** Update a contact (tenant-scoped, fail-closed). */
export async function updateCustomer(
  clientId: string,
  id: string,
  input: unknown,
  actor?: { userId?: string },
): Promise<CustomerDTO> {
  const owned = await prisma.customer.findFirst({ where: { id, clientId }, select: { id: true } });
  if (!owned) throw new CustomerError("not_found", 404);
  const parsed = customerUpdateSchema.parse(input);
  const customer = await prisma.customer.update({ where: { id }, data: toData(parsed), include: COUNT_SELECT });
  await writeAudit({ action: "customer.updated", entityType: "Customer", entityId: id, clientId, actorId: actor?.userId ?? null });
  return toDTO(customer);
}

/** Archive / unarchive (soft hide). Keeps all history; reversible. */
export async function setCustomerArchived(
  clientId: string,
  id: string,
  archived: boolean,
  actor?: { userId?: string },
): Promise<CustomerDTO> {
  const owned = await prisma.customer.findFirst({ where: { id, clientId }, select: { id: true } });
  if (!owned) throw new CustomerError("not_found", 404);
  const customer = await prisma.customer.update({
    where: { id },
    data: { archivedAt: archived ? new Date() : null },
    include: COUNT_SELECT,
  });
  await writeAudit({ action: archived ? "customer.archived" : "customer.unarchived", entityType: "Customer", entityId: id, clientId, actorId: actor?.userId ?? null });
  return toDTO(customer);
}

/**
 * Permanently delete a contact. Blocked when the contact has financial history (invoices / payments
 * / statements) — those must keep their customer link, so the owner archives instead. Non-financial
 * links (leads, bookings, conversations) are detached; cascade-owned rows (notes, consents) drop with
 * the row. Done in a transaction so a contact is never half-deleted.
 */
export async function deleteCustomer(clientId: string, id: string, actor?: { userId?: string }): Promise<void> {
  const owned = await prisma.customer.findFirst({
    where: { id, clientId },
    select: { id: true, _count: { select: { invoices: true, payments: true, statements: true } } },
  });
  if (!owned) throw new CustomerError("not_found", 404);
  if (owned._count.invoices > 0 || owned._count.payments > 0 || owned._count.statements > 0) {
    throw new CustomerError("has_financial_records", 409);
  }
  await prisma.$transaction([
    prisma.lead.updateMany({ where: { customerId: id }, data: { customerId: null } }),
    prisma.booking.updateMany({ where: { customerId: id }, data: { customerId: null } }),
    prisma.conversation.updateMany({ where: { customerId: id }, data: { customerId: null } }),
    prisma.accountBalance.deleteMany({ where: { customerId: id } }),
    prisma.customer.delete({ where: { id } }),
  ]);
  await writeAudit({ action: "customer.deleted", entityType: "Customer", entityId: id, clientId, actorId: actor?.userId ?? null });
}

/**
 * Merge a duplicate into a primary contact: repoint all of the duplicate's history onto the primary,
 * fill any blank primary fields from the duplicate, union tags/custom-fields, combine notes & balance,
 * then delete the duplicate. All in one transaction. Both must belong to the tenant.
 */
export async function mergeCustomers(
  clientId: string,
  primaryId: string,
  duplicateId: string,
  actor?: { userId?: string },
): Promise<CustomerDTO> {
  if (primaryId === duplicateId) throw new CustomerError("same_customer", 400);
  const [primary, dup] = await Promise.all([
    prisma.customer.findFirst({ where: { id: primaryId, clientId } }),
    prisma.customer.findFirst({ where: { id: duplicateId, clientId } }),
  ]);
  if (!primary || !dup) throw new CustomerError("not_found", 404);

  // Merge scalar fields: keep the primary's value, fall back to the duplicate's.
  const mergedTags = Array.from(new Set([...(primary.tags ?? []), ...(dup.tags ?? [])]));
  const mergedFields = [...parseCustomFields(primary.customFields), ...parseCustomFields(dup.customFields)];
  // De-dup custom fields by label (primary wins).
  const seen = new Set<string>();
  const dedupFields = mergedFields.filter((f) => {
    const k = f.label.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const mergedNote = [primary.note, dup.note].filter(Boolean).join("\n\n").trim() || null;

  await prisma.$transaction(async (tx) => {
    // Repoint history.
    await tx.lead.updateMany({ where: { customerId: duplicateId }, data: { customerId: primaryId } });
    await tx.booking.updateMany({ where: { customerId: duplicateId }, data: { customerId: primaryId } });
    await tx.invoice.updateMany({ where: { customerId: duplicateId }, data: { customerId: primaryId } });
    await tx.payment.updateMany({ where: { customerId: duplicateId }, data: { customerId: primaryId } });
    await tx.conversation.updateMany({ where: { customerId: duplicateId }, data: { customerId: primaryId } });
    await tx.statement.updateMany({ where: { customerId: duplicateId }, data: { customerId: primaryId } });
    await tx.customerNote.updateMany({ where: { customerId: duplicateId }, data: { customerId: primaryId } });

    // Consents are unique per (customer, channel): move only those the primary lacks, drop the rest.
    const dupConsents = await tx.customerConsent.findMany({ where: { customerId: duplicateId } });
    const primaryConsents = await tx.customerConsent.findMany({ where: { customerId: primaryId }, select: { channel: true } });
    const haveChannels = new Set(primaryConsents.map((c) => c.channel));
    for (const c of dupConsents) {
      if (haveChannels.has(c.channel)) await tx.customerConsent.delete({ where: { id: c.id } });
      else await tx.customerConsent.update({ where: { id: c.id }, data: { customerId: primaryId } });
    }

    // Account balances are unique per customer: fold the duplicate's into the primary's, then drop it.
    const dupBal = await tx.accountBalance.findUnique({ where: { customerId: duplicateId } });
    if (dupBal) {
      const primBal = await tx.accountBalance.findUnique({ where: { customerId: primaryId } });
      if (primBal) {
        await tx.accountBalance.update({ where: { customerId: primaryId }, data: { balance: primBal.balance + dupBal.balance } });
        await tx.accountBalance.delete({ where: { customerId: duplicateId } });
      } else {
        await tx.accountBalance.update({ where: { customerId: duplicateId }, data: { customerId: primaryId } });
      }
    }

    // Fill primary blanks + merged collections.
    await tx.customer.update({
      where: { id: primaryId },
      data: {
        email: primary.email ?? dup.email,
        phone: primary.phone ?? dup.phone,
        company: primary.company ?? dup.company,
        address: primary.address ?? dup.address,
        note: mergedNote,
        tags: mergedTags,
        customFields: dedupFields as unknown as Prisma.InputJsonValue,
      },
    });

    await tx.customer.delete({ where: { id: duplicateId } });
  });

  await writeAudit({
    action: "customer.merged",
    entityType: "Customer",
    entityId: primaryId,
    clientId,
    actorId: actor?.userId ?? null,
    metadata: { mergedFrom: duplicateId } satisfies Prisma.InputJsonValue,
  });
  const fresh = await prisma.customer.findFirst({ where: { id: primaryId }, include: COUNT_SELECT });
  return toDTO(fresh!);
}

/**
 * Auto-add / link a contact when a lead arrives from the public form. Matches an existing contact by
 * email (then phone) within the tenant; links the lead to it and fills any blank fields, otherwise
 * creates a fresh contact (source "website"). Returns the customer id, or null if nothing to match on.
 * Fail-soft by design — the caller logs and never blocks lead creation on this.
 */
export async function upsertCustomerFromLead(lead: Pick<Lead, "id" | "clientId" | "name" | "email" | "phone">): Promise<string | null> {
  const { clientId } = lead;
  const email = lead.email?.trim() || null;
  const phone = lead.phone?.trim() || null;
  if (!email && !phone) return null;

  const existing = await prisma.customer.findFirst({
    where: {
      clientId,
      OR: [...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []), ...(phone ? [{ phone }] : [])],
    },
    orderBy: { createdAt: "asc" },
  });

  if (existing) {
    await prisma.customer.update({
      where: { id: existing.id },
      data: {
        email: existing.email ?? email,
        phone: existing.phone ?? phone,
        // Un-archive on new activity so they reappear in the active list.
        archivedAt: null,
      },
    });
    await prisma.lead.update({ where: { id: lead.id }, data: { customerId: existing.id } });
    return existing.id;
  }

  const created = await prisma.customer.create({
    data: { clientId, name: lead.name, email, phone, source: "website" },
  });
  await prisma.lead.update({ where: { id: lead.id }, data: { customerId: created.id } });
  await writeAudit({ action: "customer.created", entityType: "Customer", entityId: created.id, clientId, metadata: { via: "lead" } satisfies Prisma.InputJsonValue });
  return created.id;
}
