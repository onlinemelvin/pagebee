import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/modules/audit";
import { registerClient } from "@/lib/modules/registration";
import { SalesError } from "./errors";
import { getQuote } from "./quotes";

/** Convertible quote states — the prospect has seen an offer the rep can close on. */
const CONVERTIBLE = new Set(["DRAFT", "APPROVED", "SENT", "VIEWED", "ACCEPTED"]);

/**
 * Rep-assisted conversion: turn an accepted quote into a paying tenant, carrying the attribution the
 * commission engine needs. Creates the Client via the shared `registerClient` (single source of truth
 * for tenant setup), then links `Client.sourceQuoteId` + `Client.prospectId`, overrides the agreed
 * fees with the quote's offered pricing, and marks the quote CONVERTED + prospect closed. The new
 * owner gets the standard welcome email and sets their own password via forgot-password.
 *
 * Attribution set here is exactly what `accrual.ts` reads on setup-fee payment. See SALES_REP_PROGRAM.md.
 */
export async function convertQuoteToClient(
  repId: string,
  quoteId: string,
  actor?: { userId?: string },
) {
  const quote = await getQuote(repId, quoteId); // rep-scoped; throws 404 if not theirs
  if (quote.status === "CONVERTED") throw new SalesError("already_converted", 409);
  if (quote.status === "NEEDS_APPROVAL") throw new SalesError("approval_required", 409);
  if (!CONVERTIBLE.has(quote.status)) throw new SalesError("quote_not_convertible", 409);

  const prospect = quote.prospect;
  if (!prospect?.email) throw new SalesError("prospect_email_required", 400);
  const existing = await prisma.client.findFirst({
    where: { OR: [{ prospectId: prospect.id }, { sourceQuoteId: quote.id }] },
    select: { id: true },
  });
  if (existing) throw new SalesError("prospect_already_converted", 409);

  // A throwaway password the owner immediately replaces via the branded forgot-password flow.
  const tempPassword = randomBytes(18).toString("base64url");

  const { clientId } = await registerClient({
    businessName: prospect.businessName,
    businessType: prospect.businessType ?? undefined,
    ownerName: prospect.contactName ?? prospect.businessName,
    email: prospect.email,
    phone: prospect.phone ?? undefined,
    password: tempPassword,
    plan: quote.plan,
  });

  await prisma.$transaction([
    prisma.client.update({ where: { id: clientId }, data: { prospectId: prospect.id, sourceQuoteId: quote.id } }),
    prisma.subscription.update({
      where: { clientId },
      data: { agreedSetupFee: quote.offeredSetupFee, agreedMonthlyFee: quote.offeredMonthlyFee },
    }),
    prisma.quote.update({ where: { id: quote.id }, data: { status: "CONVERTED", acceptedAt: new Date() } }),
    prisma.prospect.update({ where: { id: prospect.id }, data: { status: "closed" } }),
  ]);

  await writeAudit({
    action: "quote.converted",
    entityType: "Quote",
    entityId: quote.id,
    clientId,
    actorId: actor?.userId ?? null,
    metadata: { repId, prospectId: prospect.id },
  });
  return { clientId };
}
