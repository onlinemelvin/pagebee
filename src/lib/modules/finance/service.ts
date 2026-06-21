import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import type { Prisma, Invoice, InvoiceLineItem, FinanceDocType, InvoiceStatus } from "@prisma/client";
import { writeAudit } from "@/lib/modules/audit";
import * as customerNotify from "@/lib/modules/email/customer-notifications";
import { requireWithinLimit, UsageError } from "@/lib/modules/usage";
import { computeTotals, type LineInput } from "./money";
import { renderDocumentPdf, pdfFilename, type PdfBusiness } from "./pdf";
import { calculateTax } from "@/lib/modules/payments/tax";
import {
  documentInputSchema,
  taxRateSchema,
  financeSettingsSchema,
  manualPaymentSchema,
  type DocType,
  type FinanceSettings,
} from "./schema";

export class FinanceError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const pad = (n: number) => String(n).padStart(4, "0");

/**
 * Hard tier gate: finance (estimates/quotes/invoices/payments) is an Automate-tier capability.
 * Enforced server-side on every create/mutate path so a lower tier can't reach it via the API,
 * regardless of the UI. Mirrors `assertBookingEnabled`.
 */
export async function assertFinanceEnabled(clientId: string): Promise<void> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { subscription: { select: { plan: { select: { featureFlags: true } } } } },
  });
  if (!client) throw new FinanceError(404, "client_not_found");
  const flags = (client.subscription?.plan.featureFlags ?? {}) as Record<string, unknown>;
  if (!(flags.invoices ?? flags.payments)) throw new FinanceError(403, "tier_required");
}

// ── Settings ────────────────────────────────────────────────────────────────

export async function getFinanceSettings(clientId: string): Promise<FinanceSettings> {
  const cs = await prisma.clientSetting.findUnique({ where: { clientId }, select: { financeSettings: true } });
  const parsed = cs?.financeSettings ? financeSettingsSchema.safeParse(cs.financeSettings) : null;
  return parsed?.success ? parsed.data : financeSettingsSchema.parse({});
}

export async function saveFinanceSettings(clientId: string, input: unknown): Promise<FinanceSettings> {
  await assertFinanceEnabled(clientId);
  const value = financeSettingsSchema.parse(input);
  await prisma.clientSetting.upsert({
    where: { clientId },
    update: { financeSettings: value as unknown as Prisma.InputJsonValue },
    create: { clientId, financeSettings: value as unknown as Prisma.InputJsonValue },
  });
  await writeAudit({ action: "finance.settings_updated", entityType: "ClientSetting", entityId: clientId, clientId });
  return value;
}

// ── Tax rates ─────────────────────────────────────────────────────────────────

export interface TaxRateDTO {
  id: string;
  name: string;
  rateBps: number;
  inclusive: boolean;
  isDefault: boolean;
  active: boolean;
}
const taxDTO = (t: { id: string; name: string; rateBps: number; inclusive: boolean; isDefault: boolean; active: boolean }): TaxRateDTO => ({
  id: t.id,
  name: t.name,
  rateBps: t.rateBps,
  inclusive: t.inclusive,
  isDefault: t.isDefault,
  active: t.active,
});

export async function listTaxRates(clientId: string): Promise<TaxRateDTO[]> {
  const rows = await prisma.taxRate.findMany({ where: { clientId, active: true }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
  return rows.map(taxDTO);
}

export async function createTaxRate(clientId: string, input: unknown): Promise<TaxRateDTO> {
  await assertFinanceEnabled(clientId);
  const data = taxRateSchema.parse(input);
  if (data.isDefault) await prisma.taxRate.updateMany({ where: { clientId, isDefault: true }, data: { isDefault: false } });
  const created = await prisma.taxRate.create({ data: { clientId, ...data } });
  await writeAudit({ action: "finance.tax_rate_created", entityType: "TaxRate", entityId: created.id, clientId });
  return taxDTO(created);
}

export async function updateTaxRate(clientId: string, id: string, input: unknown): Promise<TaxRateDTO> {
  const existing = await prisma.taxRate.findFirst({ where: { id, clientId }, select: { id: true } });
  if (!existing) throw new FinanceError(404, "not_found");
  const data = taxRateSchema.partial().parse(input);
  if (data.isDefault) await prisma.taxRate.updateMany({ where: { clientId, isDefault: true }, data: { isDefault: false } });
  const updated = await prisma.taxRate.update({ where: { id }, data });
  return taxDTO(updated);
}

export async function deleteTaxRate(clientId: string, id: string): Promise<{ id: string }> {
  const existing = await prisma.taxRate.findFirst({ where: { id, clientId }, select: { id: true } });
  if (!existing) throw new FinanceError(404, "not_found");
  await prisma.taxRate.update({ where: { id }, data: { active: false } }); // soft delete (keeps line snapshots intact)
  return { id };
}

// ── Documents ───────────────────────────────────────────────────────────────

export interface DocLineDTO {
  id: string;
  serviceId: string | null;
  description: string;
  quantity: number;
  unitAmount: number;
  discountType: "PERCENT" | "FIXED" | null;
  discountValue: number;
  taxRateId: string | null;
  taxRateBps: number;
  taxAmount: number;
  amount: number;
  position: number;
}

export interface DocumentDTO {
  id: string;
  docType: FinanceDocType;
  number: string;
  status: InvoiceStatus;
  currency: string;
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  subtotal: number;
  discountType: "PERCENT" | "FIXED" | null;
  discountValue: number;
  discountTotal: number;
  tax: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  depositAmount: number;
  notes: string | null;
  terms: string | null;
  issueDate: string | null;
  dueDate: string | null;
  expiresAt: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  paidAt: string | null;
  convertedFromId: string | null;
  convertedToId: string | null;
  publicToken: string | null;
  bookingId: string | null;
  createdAt: string;
  lineItems: DocLineDTO[];
}

type InvoiceWithRelations = Invoice & {
  lineItems: InvoiceLineItem[];
  customer: { id: string; name: string | null; email: string | null; phone: string | null } | null;
  convertedTo: { id: string } | null;
};

function documentDTO(inv: InvoiceWithRelations): DocumentDTO {
  return {
    id: inv.id,
    docType: inv.docType,
    number: inv.number,
    status: inv.status,
    currency: inv.currency,
    customerId: inv.customerId,
    customerName: inv.customer?.name ?? null,
    customerEmail: inv.customer?.email ?? null,
    customerPhone: inv.customer?.phone ?? null,
    subtotal: inv.subtotal,
    discountType: inv.discountType,
    discountValue: inv.discountValue,
    discountTotal: inv.discountTotal,
    tax: inv.tax,
    total: inv.total,
    amountPaid: inv.amountPaid,
    balanceDue: inv.total - inv.amountPaid,
    depositAmount: inv.depositAmount,
    notes: inv.notes,
    terms: inv.terms,
    issueDate: inv.issueDate?.toISOString() ?? null,
    dueDate: inv.dueDate?.toISOString() ?? null,
    expiresAt: inv.expiresAt?.toISOString() ?? null,
    sentAt: inv.sentAt?.toISOString() ?? null,
    acceptedAt: inv.acceptedAt?.toISOString() ?? null,
    declinedAt: inv.declinedAt?.toISOString() ?? null,
    paidAt: inv.paidAt?.toISOString() ?? null,
    convertedFromId: inv.convertedFromId,
    convertedToId: inv.convertedTo?.id ?? null,
    publicToken: inv.publicToken,
    bookingId: inv.bookingId,
    createdAt: inv.createdAt.toISOString(),
    lineItems: [...inv.lineItems]
      .sort((a, b) => a.position - b.position)
      .map((l) => ({
        id: l.id,
        serviceId: l.serviceId,
        description: l.description,
        quantity: l.quantity,
        unitAmount: l.unitAmount,
        discountType: l.discountType,
        discountValue: l.discountValue,
        taxRateId: l.taxRateId,
        taxRateBps: l.taxRateBps,
        taxAmount: l.taxAmount,
        amount: l.amount,
        position: l.position,
      })),
  };
}

const INCLUDE = {
  lineItems: true,
  customer: { select: { id: true, name: true, email: true, phone: true } },
  convertedTo: { select: { id: true } },
} as const;

function toDate(s?: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Next per-client document number, e.g. INV-0001 (collision-safe via the [clientId, number] unique). */
async function nextNumber(clientId: string, docType: DocType, settings: FinanceSettings): Promise<string> {
  const prefix = settings.numberPrefixes[docType] || docType.slice(0, 3);
  const count = await prisma.invoice.count({ where: { clientId, docType } });
  let seq = count + 1;
  // Skip any number already taken (e.g. after deletions).
  while (await prisma.invoice.findFirst({ where: { clientId, number: `${prefix}-${pad(seq)}` }, select: { id: true } })) seq++;
  return `${prefix}-${pad(seq)}`;
}

/** Resolve customer + tax snapshots and compute totals from a validated input. */
interface BillingAddr {
  line1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

async function buildDocData(clientId: string, input: unknown, settings: FinanceSettings) {
  const data = documentInputSchema.parse(input);
  const automatic = settings.taxMode === "automatic";

  const addrIn = data.customerAddress;
  const addrFilled = Boolean(addrIn && (addrIn.line1 || addrIn.postalCode || addrIn.state));

  // Customer: existing (verified) or inline-created. Persist the billing address either way.
  let customerId = data.customerId ?? null;
  let billingAddress: BillingAddr | null = addrFilled ? (addrIn as BillingAddr) : null;
  if (customerId) {
    const owned = await prisma.customer.findFirst({ where: { id: customerId, clientId }, select: { id: true, billingAddress: true } });
    if (!owned) throw new FinanceError(400, "invalid_customer");
    if (addrFilled) await prisma.customer.update({ where: { id: customerId }, data: { billingAddress: addrIn as unknown as Prisma.InputJsonValue } });
    else billingAddress = (owned.billingAddress as BillingAddr | null) ?? null;
  } else if (data.customer?.name) {
    const created = await prisma.customer.create({
      data: {
        clientId,
        name: data.customer.name,
        email: data.customer.email || null,
        phone: data.customer.phone || null,
        billingAddress: addrFilled ? (addrIn as unknown as Prisma.InputJsonValue) : undefined,
      },
    });
    customerId = created.id;
  }

  // Manual tax-rate snapshots (only consulted in manual mode).
  const rateIds = automatic ? [] : ([...new Set(data.lineItems.map((l) => l.taxRateId).filter(Boolean))] as string[]);
  const rates = rateIds.length
    ? await prisma.taxRate.findMany({ where: { id: { in: rateIds }, clientId }, select: { id: true, rateBps: true, inclusive: true } })
    : [];
  const rateMap = new Map(rates.map((r) => [r.id, r]));

  const lineInputs: LineInput[] = data.lineItems.map((l) => {
    const rate = !automatic && l.taxRateId ? rateMap.get(l.taxRateId) : undefined;
    return {
      quantity: l.quantity,
      unitAmount: l.unitAmount,
      discountType: l.discountType ?? null,
      discountValue: l.discountValue,
      taxRateBps: rate?.rateBps ?? 0,
      taxInclusive: rate?.inclusive ?? false,
    };
  });
  const base = computeTotals(lineInputs, { type: data.discountType ?? null, value: data.discountValue });

  let lineTaxAmounts = base.lines.map((l) => l.taxAmount);
  let taxTotal = base.tax;
  let taxCalculationId: string | null = null;

  if (automatic) {
    if (billingAddress && base.subtotal > 0) {
      // Tax the post-discount taxable base per line (Stripe returns per-line + total tax).
      const netLines = base.lines.map((l, i) => ({
        amount: Math.max(0, Math.round(l.amount - base.discountTotal * (l.amount / base.subtotal))),
        reference: String(i),
      }));
      const res = await calculateTax(clientId, { currency: data.currency, lines: netLines.filter((l) => l.amount > 0), address: billingAddress });
      taxTotal = res.tax;
      taxCalculationId = res.calculationId;
      lineTaxAmounts = base.lines.map((_, i) => res.lineTax[String(i)] ?? 0);
    } else {
      taxTotal = 0;
      lineTaxAmounts = base.lines.map(() => 0);
    }
  }

  const totals = {
    subtotal: base.subtotal,
    discountTotal: base.discountTotal,
    tax: taxTotal,
    total: base.subtotal - base.discountTotal + taxTotal,
  };

  const lineRows = data.lineItems.map((l, i) => ({
    serviceId: l.serviceId ?? null,
    description: l.description,
    quantity: l.quantity,
    unitAmount: l.unitAmount,
    discountType: l.discountType ?? null,
    discountValue: l.discountValue,
    taxRateId: automatic ? null : (l.taxRateId ?? null),
    taxRateBps: automatic ? 0 : (lineInputs[i].taxRateBps ?? 0),
    taxAmount: lineTaxAmounts[i],
    amount: base.lines[i].amount,
    position: i,
  }));

  return { data, customerId, totals, lineRows, taxCalculationId };
}

export async function createDocument(clientId: string, input: unknown): Promise<DocumentDTO> {
  await assertFinanceEnabled(clientId);
  const settings = await getFinanceSettings(clientId);
  const { data, customerId, totals, lineRows, taxCalculationId } = await buildDocData(clientId, input, settings);

  // Monthly invoice allowance (plans meter invoices; estimates/quotes don't count).
  if (data.docType === "INVOICE") {
    try {
      await requireWithinLimit(clientId, "invoices");
    } catch (err) {
      if (err instanceof UsageError) throw new FinanceError(429, "invoice_limit_reached");
      throw err;
    }
  }

  const number = await nextNumber(clientId, data.docType, settings);

  // Default dates by type.
  const issueDate = toDate(data.issueDate) ?? new Date();
  const dueDate =
    toDate(data.dueDate) ??
    (data.docType === "INVOICE" ? new Date(issueDate.getTime() + settings.defaultDueDays * 86_400_000) : null);
  const expiresAt =
    toDate(data.expiresAt) ??
    (data.docType !== "INVOICE" ? new Date(issueDate.getTime() + settings.estimateValidDays * 86_400_000) : null);

  const created = await prisma.invoice.create({
    data: {
      kind: "CLIENT_CUSTOMER",
      docType: data.docType,
      clientId,
      customerId,
      number,
      status: "DRAFT",
      currency: data.currency,
      subtotal: totals.subtotal,
      discountType: data.discountType ?? null,
      discountValue: data.discountValue,
      discountTotal: totals.discountTotal,
      tax: totals.tax,
      total: totals.total,
      taxCalculationId,
      depositAmount: data.depositAmount,
      notes: data.notes ?? null,
      terms: data.terms ?? settings.defaultTerms ?? null,
      issueDate,
      dueDate,
      expiresAt,
      lineItems: { create: lineRows },
    },
    include: INCLUDE,
  });
  await writeAudit({ action: "finance.document_created", entityType: "Invoice", entityId: created.id, clientId, metadata: { docType: data.docType, number } });
  return documentDTO(created);
}

const EDITABLE: InvoiceStatus[] = ["DRAFT"];

export async function updateDocument(clientId: string, id: string, input: unknown): Promise<DocumentDTO> {
  await assertFinanceEnabled(clientId);
  const existing = await prisma.invoice.findFirst({ where: { id, clientId }, select: { id: true, status: true, docType: true } });
  if (!existing) throw new FinanceError(404, "not_found");
  if (!EDITABLE.includes(existing.status)) throw new FinanceError(409, "not_editable");

  const settings = await getFinanceSettings(clientId);
  const { data, customerId, totals, lineRows, taxCalculationId } = await buildDocData(clientId, input, settings);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.invoiceLineItem.deleteMany({ where: { invoiceId: id } });
    return tx.invoice.update({
      where: { id },
      data: {
        customerId,
        currency: data.currency,
        subtotal: totals.subtotal,
        discountType: data.discountType ?? null,
        discountValue: data.discountValue,
        discountTotal: totals.discountTotal,
        tax: totals.tax,
        total: totals.total,
        taxCalculationId,
        depositAmount: data.depositAmount,
        notes: data.notes ?? null,
        terms: data.terms ?? null,
        issueDate: toDate(data.issueDate) ?? undefined,
        dueDate: toDate(data.dueDate),
        expiresAt: toDate(data.expiresAt),
        lineItems: { create: lineRows },
      },
      include: INCLUDE,
    });
  });
  await writeAudit({ action: "finance.document_updated", entityType: "Invoice", entityId: id, clientId });
  return documentDTO(updated);
}

export async function listDocuments(
  clientId: string,
  filter?: { docType?: DocType; status?: InvoiceStatus; customerId?: string },
): Promise<DocumentDTO[]> {
  const rows = await prisma.invoice.findMany({
    where: { clientId, kind: "CLIENT_CUSTOMER", ...(filter?.docType ? { docType: filter.docType } : {}), ...(filter?.status ? { status: filter.status } : {}), ...(filter?.customerId ? { customerId: filter.customerId } : {}) },
    include: INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(documentDTO);
}

export async function getDocument(clientId: string, id: string): Promise<DocumentDTO> {
  const inv = await prisma.invoice.findFirst({ where: { id, clientId }, include: INCLUDE });
  if (!inv) throw new FinanceError(404, "not_found");
  return documentDTO(inv);
}

export async function deleteDocument(clientId: string, id: string): Promise<{ id: string }> {
  const existing = await prisma.invoice.findFirst({ where: { id, clientId }, select: { id: true, status: true } });
  if (!existing) throw new FinanceError(404, "not_found");
  if (!EDITABLE.includes(existing.status)) throw new FinanceError(409, "not_deletable");
  await prisma.invoice.delete({ where: { id } });
  await writeAudit({ action: "finance.document_deleted", entityType: "Invoice", entityId: id, clientId });
  return { id };
}

/** Send the document to the customer: stamp SENT, mint a public token, email a hosted link. */
export async function sendDocument(clientId: string, id: string): Promise<DocumentDTO> {
  await assertFinanceEnabled(clientId);
  const inv = await prisma.invoice.findFirst({ where: { id, clientId }, include: { customer: true } });
  if (!inv) throw new FinanceError(404, "not_found");
  const token = inv.publicToken ?? randomBytes(24).toString("base64url");
  const updated = await prisma.invoice.update({
    where: { id },
    data: { status: "SENT", sentAt: new Date(), publicToken: token },
    include: INCLUDE,
  });

  if (inv.customer?.email) {
    const dto = documentDTO(updated);
    // Attach a PDF copy so the customer keeps a record even without opening the hosted link. Best-
    // effort: if PDF generation fails for any reason, still send the email with the link.
    let attachments;
    try {
      const business = await buildPdfBusiness(clientId);
      attachments = [{ filename: pdfFilename(dto), content: await renderDocumentPdf(dto, business) }];
    } catch (err) {
      console.error("[finance] PDF attach failed; sending without it", err);
    }
    const viewUrl = `${APP_URL}/d/${token}`;
    const dueOn = updated.dueDate ? updated.dueDate.toLocaleDateString("en-US", { dateStyle: "long" }) : undefined;
    const common = { to: inv.customer.email, customerId: inv.customerId, customerName: inv.customer.name, number: inv.number, amountCents: updated.total, viewUrl, attachments };
    if (inv.docType === "INVOICE") {
      await customerNotify.sendInvoiceSent(clientId, { ...common, dueOn });
    } else {
      await customerNotify.sendEstimateSent(clientId, { ...common, expiresOn: dueOn });
    }
  }
  await writeAudit({ action: "finance.document_sent", entityType: "Invoice", entityId: id, clientId });
  return documentDTO(updated);
}

/** Build the business header for a PDF from finance settings (falling back to the client record). */
async function buildPdfBusiness(clientId: string): Promise<PdfBusiness> {
  const [client, settings] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { businessName: true, ownerEmail: true } }),
    getFinanceSettings(clientId),
  ]);
  const bi = settings.businessInfo ?? { name: "", email: "", phone: "", address: "" };
  return {
    name: bi.name || client?.businessName || null,
    email: bi.email || client?.ownerEmail || null,
    phone: bi.phone || null,
    address: bi.address || null,
  };
}

/**
 * Create a DRAFT invoice/estimate from an appointment: prefills the customer and a single line from
 * the booked service (using the catalog price when the name matches), and links it back to the
 * booking so the appointment can show its invoice status. Returns the new draft.
 */
export async function createDocumentFromBooking(clientId: string, bookingId: string, opts?: { docType?: DocType }): Promise<DocumentDTO> {
  await assertFinanceEnabled(clientId);
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, clientId }, include: { customer: true } });
  if (!booking) throw new FinanceError(404, "booking_not_found");
  // Match a catalog service by name for the unit price (best-effort; falls back to 0 to fill in).
  const svc = await prisma.service.findFirst({ where: { clientId, title: { equals: booking.serviceName, mode: "insensitive" } }, select: { id: true, price: true } });
  const docType = opts?.docType ?? "INVOICE";
  const doc = await createDocument(clientId, {
    docType,
    customerId: booking.customerId ?? null,
    customer: booking.customerId ? undefined : { name: booking.customer?.name ?? "Customer", email: booking.customer?.email ?? "", phone: booking.customer?.phone ?? "" },
    currency: undefined,
    lineItems: [{ serviceId: svc?.id ?? null, description: booking.serviceName, quantity: 1, unitAmount: svc?.price ?? 0, discountType: null, discountValue: 0, taxRateId: null }],
  });
  await prisma.invoice.update({ where: { id: doc.id }, data: { bookingId } });
  await writeAudit({ action: "finance.document_from_booking", entityType: "Invoice", entityId: doc.id, clientId, metadata: { bookingId } satisfies Prisma.InputJsonValue });
  return getDocument(clientId, doc.id);
}

/** Latest invoice/estimate linked to each of the given bookings — to show invoice status on appointments. */
export async function bookingInvoiceStatuses(clientId: string, bookingIds: string[]): Promise<Record<string, { id: string; status: InvoiceStatus; docType: FinanceDocType }>> {
  if (bookingIds.length === 0) return {};
  const rows = await prisma.invoice.findMany({
    where: { clientId, bookingId: { in: bookingIds } },
    orderBy: { createdAt: "desc" },
    select: { id: true, bookingId: true, status: true, docType: true },
  });
  const map: Record<string, { id: string; status: InvoiceStatus; docType: FinanceDocType }> = {};
  for (const r of rows) {
    if (r.bookingId && !map[r.bookingId]) map[r.bookingId] = { id: r.id, status: r.status, docType: r.docType };
  }
  return map;
}

/** Owner-side PDF download for a document (tenant-scoped). */
export async function getDocumentPdf(clientId: string, id: string): Promise<{ buffer: Buffer; filename: string }> {
  const doc = await getDocument(clientId, id);
  const business = await buildPdfBusiness(clientId);
  return { buffer: await renderDocumentPdf(doc, business), filename: pdfFilename(doc) };
}

/** Public PDF download for a hosted document (by its public token). Null if the token is unknown. */
export async function getPublicDocumentPdf(token: string): Promise<{ buffer: Buffer; filename: string } | null> {
  const row = await prisma.invoice.findFirst({ where: { publicToken: token }, select: { clientId: true } });
  const doc = await getPublicDocument(token);
  if (!row || !doc) return null;
  const business = await buildPdfBusiness(row.clientId);
  return { buffer: await renderDocumentPdf(doc, business), filename: pdfFilename(doc) };
}

/** Estimate/quote decision (by the owner, or via the public endpoint). */
export async function decideDocument(clientId: string, id: string, decision: "ACCEPTED" | "DECLINED"): Promise<DocumentDTO> {
  const inv = await prisma.invoice.findFirst({ where: { id, clientId }, select: { id: true, docType: true } });
  if (!inv) throw new FinanceError(404, "not_found");
  if (inv.docType === "INVOICE") throw new FinanceError(409, "not_a_quote");
  const updated = await prisma.invoice.update({
    where: { id },
    data: decision === "ACCEPTED" ? { status: "ACCEPTED", acceptedAt: new Date() } : { status: "DECLINED", declinedAt: new Date() },
    include: INCLUDE,
  });
  await writeAudit({ action: `finance.document_${decision.toLowerCase()}`, entityType: "Invoice", entityId: id, clientId });
  return documentDTO(updated);
}

/** Convert ESTIMATE→QUOTE→INVOICE (or skip a step). Copies the document into a new DRAFT and links it. */
export async function convertDocument(clientId: string, id: string, toType: DocType): Promise<DocumentDTO> {
  await assertFinanceEnabled(clientId);
  const src = await prisma.invoice.findFirst({ where: { id, clientId }, include: { lineItems: true, convertedTo: { select: { id: true } } } });
  if (!src) throw new FinanceError(404, "not_found");
  if (src.convertedTo) throw new FinanceError(409, "already_converted");
  const order: DocType[] = ["ESTIMATE", "QUOTE", "INVOICE"];
  if (order.indexOf(toType) <= order.indexOf(src.docType as DocType)) throw new FinanceError(400, "invalid_conversion");

  const settings = await getFinanceSettings(clientId);
  const number = await nextNumber(clientId, toType, settings);
  const issueDate = new Date();
  const dueDate = toType === "INVOICE" ? new Date(issueDate.getTime() + settings.defaultDueDays * 86_400_000) : null;
  const expiresAt = toType !== "INVOICE" ? new Date(issueDate.getTime() + settings.estimateValidDays * 86_400_000) : null;

  const created = await prisma.$transaction(async (tx) => {
    const doc = await tx.invoice.create({
      data: {
        kind: "CLIENT_CUSTOMER",
        docType: toType,
        clientId,
        customerId: src.customerId,
        number,
        status: "DRAFT",
        currency: src.currency,
        subtotal: src.subtotal,
        discountType: src.discountType,
        discountValue: src.discountValue,
        discountTotal: src.discountTotal,
        tax: src.tax,
        total: src.total,
        depositAmount: src.depositAmount,
        notes: src.notes,
        terms: src.terms,
        issueDate,
        dueDate,
        expiresAt,
        convertedFromId: src.id,
        lineItems: {
          create: src.lineItems.map((l) => ({
            serviceId: l.serviceId,
            description: l.description,
            quantity: l.quantity,
            unitAmount: l.unitAmount,
            discountType: l.discountType,
            discountValue: l.discountValue,
            taxRateId: l.taxRateId,
            taxRateBps: l.taxRateBps,
            taxAmount: l.taxAmount,
            amount: l.amount,
            position: l.position,
          })),
        },
      },
      include: INCLUDE,
    });
    // Mark the source accepted (estimate/quote) once it's carried forward.
    if (src.docType !== "INVOICE") {
      await tx.invoice.update({ where: { id: src.id }, data: { status: "ACCEPTED", acceptedAt: src.acceptedAt ?? new Date() } });
    }
    return doc;
  });
  await writeAudit({ action: "finance.document_converted", entityType: "Invoice", entityId: created.id, clientId, metadata: { from: src.id, toType } });
  return documentDTO(created);
}

/** Record an offline payment (cash, check, bank transfer) against an invoice. */
export async function recordManualPayment(clientId: string, id: string, input: unknown): Promise<DocumentDTO> {
  await assertFinanceEnabled(clientId);
  const { amount, note } = manualPaymentSchema.parse(input);
  const inv = await prisma.invoice.findFirst({ where: { id, clientId }, select: { id: true, docType: true, total: true, amountPaid: true } });
  if (!inv) throw new FinanceError(404, "not_found");
  if (inv.docType !== "INVOICE") throw new FinanceError(409, "not_an_invoice");
  const amountPaid = Math.min(inv.total, inv.amountPaid + amount);
  const paid = amountPaid >= inv.total;
  const updated = await prisma.invoice.update({
    where: { id },
    data: { amountPaid, status: paid ? "PAID" : "PARTIALLY_PAID", paidAt: paid ? new Date() : undefined },
    include: INCLUDE,
  });
  await writeAudit({ action: "finance.payment_recorded", entityType: "Invoice", entityId: id, clientId, metadata: { amount, note: note ?? null } });
  return documentDTO(updated);
}

// ── Public (customer hosted view) ─────────────────────────────────────────────

export async function getPublicDocument(token: string): Promise<(DocumentDTO & { businessName: string | null; paymentsEnabled: boolean }) | null> {
  const inv = await prisma.invoice.findFirst({ where: { publicToken: token }, include: { ...INCLUDE, client: { select: { businessName: true, paymentsEnabled: true } } } });
  if (!inv) return null;
  if (!inv.viewedAt && inv.status === "SENT") {
    await prisma.invoice.update({ where: { id: inv.id }, data: { viewedAt: new Date(), status: "VIEWED" } }).catch(() => {});
  }
  return { ...documentDTO(inv), businessName: inv.client.businessName, paymentsEnabled: inv.client.paymentsEnabled };
}

export async function decideByToken(token: string, decision: "ACCEPTED" | "DECLINED"): Promise<boolean> {
  const inv = await prisma.invoice.findFirst({ where: { publicToken: token }, select: { id: true, clientId: true, docType: true } });
  if (!inv || inv.docType === "INVOICE") return false;
  await decideDocument(inv.clientId, inv.id, decision);
  return true;
}

// ── Statements ────────────────────────────────────────────────────────────────

export async function generateStatement(clientId: string, customerId: string, periodStart: Date, periodEnd: Date) {
  const invoices = await prisma.invoice.findMany({
    where: { clientId, customerId, docType: "INVOICE", issueDate: { gte: periodStart, lte: periodEnd } },
    select: { id: true, number: true, issueDate: true, dueDate: true, total: true, amountPaid: true, status: true },
    orderBy: { issueDate: "asc" },
  });
  const billed = invoices.reduce((s, i) => s + i.total, 0);
  const paid = invoices.reduce((s, i) => s + i.amountPaid, 0);
  const data = {
    invoices: invoices.map((i) => ({ ...i, issueDate: i.issueDate?.toISOString() ?? null, dueDate: i.dueDate?.toISOString() ?? null })),
    billed,
    paid,
    balance: billed - paid,
  };
  const statement = await prisma.statement.create({
    data: { clientId, customerId, periodStart, periodEnd, data: data as unknown as Prisma.InputJsonValue },
  });
  await writeAudit({ action: "finance.statement_generated", entityType: "Statement", entityId: statement.id, clientId });
  return { id: statement.id, ...data, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() };
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export interface FinanceDashboard {
  totalInvoiced: number;
  totalPaid: number;
  outstanding: number;
  thisMonthRevenue: number;
  counts: { drafts: number; outstanding: number; paid: number; overdue: number; openEstimates: number; openQuotes: number };
  aging: { current: number; d1_30: number; d31_60: number; d61_90: number; d90: number };
}

export async function getFinanceDashboard(clientId: string): Promise<FinanceDashboard> {
  const invoices = await prisma.invoice.findMany({
    where: { clientId, kind: "CLIENT_CUSTOMER", docType: "INVOICE" },
    select: { status: true, total: true, amountPaid: true, dueDate: true, paidAt: true, issueDate: true },
  });
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let totalInvoiced = 0,
    totalPaid = 0,
    outstanding = 0,
    thisMonthRevenue = 0;
  let drafts = 0,
    open = 0,
    paid = 0,
    overdue = 0;
  const aging = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0 };

  for (const inv of invoices) {
    if (inv.status === "DRAFT") {
      drafts++;
      continue;
    }
    if (inv.status === "VOID") continue;
    totalInvoiced += inv.total;
    totalPaid += inv.amountPaid;
    if (inv.paidAt && inv.paidAt >= monthStart) thisMonthRevenue += inv.amountPaid;
    const bal = inv.total - inv.amountPaid;
    if (inv.status === "PAID") {
      paid++;
    } else {
      outstanding += bal;
      open++;
      const due = inv.dueDate;
      const overdueDays = due ? Math.floor((now.getTime() - due.getTime()) / 86_400_000) : 0;
      if (overdueDays > 0) overdue++;
      if (overdueDays <= 0) aging.current += bal;
      else if (overdueDays <= 30) aging.d1_30 += bal;
      else if (overdueDays <= 60) aging.d31_60 += bal;
      else if (overdueDays <= 90) aging.d61_90 += bal;
      else aging.d90 += bal;
    }
  }

  const [openEstimates, openQuotes] = await Promise.all([
    prisma.invoice.count({ where: { clientId, docType: "ESTIMATE", status: { in: ["SENT", "VIEWED", "DRAFT"] } } }),
    prisma.invoice.count({ where: { clientId, docType: "QUOTE", status: { in: ["SENT", "VIEWED", "DRAFT"] } } }),
  ]);

  return {
    totalInvoiced,
    totalPaid,
    outstanding,
    thisMonthRevenue,
    counts: { drafts, outstanding: open, paid, overdue, openEstimates, openQuotes },
    aging,
  };
}

// ── Tax & income reports ────────────────────────────────────────────────────

interface BillingAddrLite {
  state?: string;
}

export interface TaxReportRow {
  state: string;
  taxCollected: number;
  salesBase: number;
  invoiceCount: number;
}
export interface TaxReport {
  rows: TaxReportRow[];
  totalTax: number;
  totalSales: number;
  from: string;
  to: string;
}

/** Sales tax collected on PAID invoices in a period, grouped by the customer's state. */
export async function getTaxReport(clientId: string, from: Date, to: Date): Promise<TaxReport> {
  const invoices = await prisma.invoice.findMany({
    where: { clientId, kind: "CLIENT_CUSTOMER", docType: "INVOICE", status: "PAID", paidAt: { gte: from, lte: to } },
    select: { tax: true, total: true, customer: { select: { billingAddress: true } } },
  });
  const byState = new Map<string, { tax: number; sales: number; count: number }>();
  let totalTax = 0;
  let totalSales = 0;
  for (const i of invoices) {
    const state = ((i.customer?.billingAddress as BillingAddrLite | null)?.state || "—").toUpperCase();
    const e = byState.get(state) ?? { tax: 0, sales: 0, count: 0 };
    e.tax += i.tax;
    e.sales += i.total;
    e.count += 1;
    byState.set(state, e);
    totalTax += i.tax;
    totalSales += i.total;
  }
  const rows = [...byState.entries()]
    .map(([state, v]) => ({ state, taxCollected: v.tax, salesBase: v.sales, invoiceCount: v.count }))
    .sort((a, b) => b.taxCollected - a.taxCollected);
  return { rows, totalTax, totalSales, from: from.toISOString(), to: to.toISOString() };
}

export interface IncomeRow {
  number: string;
  customer: string;
  paidAt: string | null;
  total: number;
  amountPaid: number;
}
export interface IncomeReport {
  rows: IncomeRow[];
  totalCollected: number;
  invoiceCount: number;
  from: string;
  to: string;
}

/** Income collected on paid invoices in a period (per-invoice + total). */
export async function getIncomeReport(clientId: string, from: Date, to: Date): Promise<IncomeReport> {
  const invoices = await prisma.invoice.findMany({
    where: { clientId, kind: "CLIENT_CUSTOMER", docType: "INVOICE", status: "PAID", paidAt: { gte: from, lte: to } },
    select: { number: true, total: true, amountPaid: true, paidAt: true, customer: { select: { name: true } } },
    orderBy: { paidAt: "asc" },
  });
  const totalCollected = invoices.reduce((s, i) => s + i.amountPaid, 0);
  return {
    rows: invoices.map((i) => ({ number: i.number, customer: i.customer?.name ?? "—", paidAt: i.paidAt?.toISOString() ?? null, total: i.total, amountPaid: i.amountPaid })),
    totalCollected,
    invoiceCount: invoices.length,
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

// ── 1099-K summary (gross card-payment volume Stripe reports) ────────────────

export interface Form1099Summary {
  year: number;
  gross: number; // total successful card payments (cents)
  count: number; // number of transactions
  monthly: { month: number; amount: number }[]; // 12 entries
}

/**
 * The figures that appear on the client's official 1099-K: gross card-payment volume + transaction
 * count for the year, by month. Sourced from successful Stripe payments (PageBee Pay). The official
 * IRS form itself is generated/delivered by Stripe's 1099 reporting once enabled.
 */
export async function get1099Summary(clientId: string, year: number): Promise<Form1099Summary> {
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);
  const payments = await prisma.payment.findMany({
    where: { clientId, provider: "STRIPE", status: "SUCCEEDED", paidAt: { gte: start, lt: end } },
    select: { amount: true, paidAt: true },
  });
  const monthly = Array.from({ length: 12 }, (_, m) => ({ month: m + 1, amount: 0 }));
  let gross = 0;
  for (const p of payments) {
    gross += p.amount;
    if (p.paidAt) monthly[p.paidAt.getMonth()].amount += p.amount;
  }
  return { year, gross, count: payments.length, monthly };
}
