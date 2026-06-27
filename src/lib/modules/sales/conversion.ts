import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/modules/audit";
import { registerClient } from "@/lib/modules/registration";
import { createAuthUser, findAuthUserId } from "@/lib/supabase/admin";
import { SalesError } from "./errors";
import { getQuote } from "./quotes";

/** Convertible quote states — the prospect has seen an offer the rep can close on. */
const CONVERTIBLE = new Set(["DRAFT", "APPROVED", "SENT", "VIEWED", "ACCEPTED"]);

type QuoteForConvert = Awaited<ReturnType<typeof getQuote>>;

/** A throwaway password the owner immediately replaces via the branded forgot-password flow. */
function tempPassword(): string {
  return randomBytes(18).toString("base64url");
}

/**
 * Adopt a provisional preview client as the real paying tenant: add the owner login (auth identity
 * + ClientUser), flip `isTest` off, set the agreed pricing + `sourceQuote`, and close out the quote
 * + prospect. Reuses the website/preview already generated for the prospect — no second client.
 */
async function adoptProvisionalClient(clientId: string, quote: QuoteForConvert, email: string) {
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new SalesError("email_taken", 409);
  }
  const created = await createAuthUser(email, tempPassword());
  let supabaseUserId: string | undefined;
  if (created.ok) supabaseUserId = created.id;
  else if (created.status === 422 || created.status === 409) {
    supabaseUserId = await findAuthUserId(email);
    if (!supabaseUserId) throw new SalesError("email_taken", 409);
  } else {
    throw new SalesError(created.error, 502);
  }

  const prospect = quote.prospect!;
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email, name: prospect.contactName ?? prospect.businessName, type: "CLIENT", status: "ACTIVE", supabaseUserId },
    });
    await tx.clientUser.create({ data: { clientId, userId: user.id, role: "owner" } });
    await tx.client.update({ where: { id: clientId }, data: { isTest: false, ownerEmail: email, sourceQuoteId: quote.id } });
    await tx.subscription.update({
      where: { clientId },
      data: { agreedSetupFee: quote.offeredSetupFee, agreedMonthlyFee: quote.offeredMonthlyFee },
    });
    await tx.quote.update({ where: { id: quote.id }, data: { status: "CONVERTED", acceptedAt: new Date() } });
    await tx.prospect.update({ where: { id: prospect.id }, data: { status: "closed" } });
  });
}

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
  const email = prospect.email;

  const existing = await prisma.client.findFirst({
    where: { OR: [{ prospectId: prospect.id }, { sourceQuoteId: quote.id }] },
    select: { id: true, isTest: true, sourceQuoteId: true },
  });

  let clientId: string;
  if (existing) {
    // A provisional preview client (isTest, not yet adopted) → adopt it. Anything else is a real
    // client already tied to this prospect → genuinely already converted.
    if (!existing.isTest || existing.sourceQuoteId) throw new SalesError("prospect_already_converted", 409);
    await adoptProvisionalClient(existing.id, quote, email);
    clientId = existing.id;
  } else {
    // No prior client (no preview was generated) → create one fresh via the shared registration path.
    ({ clientId } = await registerClient({
      businessName: prospect.businessName,
      businessType: prospect.businessType ?? undefined,
      ownerName: prospect.contactName ?? prospect.businessName,
      email,
      phone: prospect.phone ?? undefined,
      password: tempPassword(),
      plan: quote.plan,
    }));
    await prisma.$transaction([
      prisma.client.update({ where: { id: clientId }, data: { prospectId: prospect.id, sourceQuoteId: quote.id } }),
      prisma.subscription.update({
        where: { clientId },
        data: { agreedSetupFee: quote.offeredSetupFee, agreedMonthlyFee: quote.offeredMonthlyFee },
      }),
      prisma.quote.update({ where: { id: quote.id }, data: { status: "CONVERTED", acceptedAt: new Date() } }),
      prisma.prospect.update({ where: { id: prospect.id }, data: { status: "closed" } }),
    ]);
  }

  await writeAudit({
    action: "quote.converted",
    entityType: "Quote",
    entityId: quote.id,
    clientId,
    actorId: actor?.userId ?? null,
    metadata: { repId, prospectId: prospect.id, adopted: Boolean(existing) },
  });
  return { clientId };
}
