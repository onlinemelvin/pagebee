import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/modules/audit";
import { uploadPublicFile } from "@/lib/supabase/storage";
import { appBase } from "@/lib/modules/email";
import { sendRepContractSigned } from "@/lib/modules/email/notifications";
import { SalesError } from "./errors";
import { signContractInputSchema } from "./schema";
import { DEFAULT_COMMISSION_BASES, type CommissionBases } from "./commission";
import { renderAgreementPdf, agreementPdfFilename } from "./agreement-pdf";

const REP_FLOORS = { NECTAR: 299, HONEY: 599, HIVE: 899 } as const;
const LISTED_SETUP = { NECTAR: 399, HONEY: 699, HIVE: 999 } as const;

export interface CommissionTerms {
  planName: string;
  bases: CommissionBases;
  clawbackDays: number;
  recurringPct: number;
  recurringMonths: number;
  floors: typeof REP_FLOORS;
  listedSetup: typeof LISTED_SETUP;
}

/**
 * The active commission terms a rep is signing up to — read from the active `CommissionPlan`, or the
 * documented defaults when none is seeded yet. Drives both the rendered contract and (later) accrual.
 */
export async function getCommissionTerms(): Promise<CommissionTerms> {
  const plan = await prisma.commissionPlan.findFirst({
    where: { active: true },
    orderBy: { createdAt: "desc" },
  });
  return {
    planName: plan?.name ?? "Standard rep plan",
    bases: plan
      ? { nectar: Number(plan.nectarBase), honey: Number(plan.honeyBase), hive: Number(plan.hiveBase) }
      : DEFAULT_COMMISSION_BASES,
    clawbackDays: plan?.clawbackDays ?? 30,
    recurringPct: plan ? Number(plan.recurringPct) : 0,
    recurringMonths: plan?.recurringMonths ?? 0,
    floors: REP_FLOORS,
    listedSetup: LISTED_SETUP,
  };
}

/** A short, human-readable snapshot of the commission terms, stored on `Contract.commissionTerms`. */
export function renderCommissionTerms(t: CommissionTerms): string {
  const tail =
    t.recurringPct > 0 && t.recurringMonths > 0
      ? ` Plus ${t.recurringPct}% of collected monthly fees for ${t.recurringMonths} months.`
      : "";
  return (
    `Per converted client: Nectar $${t.bases.nectar}, Honey $${t.bases.honey}, Hive $${t.bases.hive}. ` +
    `Computed on collected revenue; reduced proportionally for setup-fee discounts beyond $50 (floor 50% of base). ` +
    `Clawback window ${t.clawbackDays} days.${tail}`
  );
}

/** The rep's current commission contract (latest of type SALES_REP_COMMISSION), or null. */
export async function getRepContract(repId: string) {
  return prisma.contract.findFirst({
    where: { employeeId: repId, type: "SALES_REP_COMMISSION" },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Rep e-signs their commission agreement. The contract must be in DRAFT/SENT (company-offered);
 * signing activates it (PageBee's side is pre-committed when the contract is sent), stamps `signedAt`,
 * and records the typed signatory name + IP in the audit trail. Idempotency: an already-ACTIVE
 * contract returns 409 so a double-submit can't re-stamp it.
 */
export async function signContract(
  repId: string,
  input: unknown,
  meta?: { userId?: string; ip?: string | null },
) {
  const parsed = signContractInputSchema.parse(input);
  const contract = await getRepContract(repId);
  if (!contract) throw new SalesError("contract_not_found", 404);
  if (contract.status === "ACTIVE" || contract.status === "SIGNED") {
    throw new SalesError("already_signed", 409);
  }
  if (contract.status !== "DRAFT" && contract.status !== "SENT") {
    throw new SalesError("contract_not_signable", 409); // EXPIRED / TERMINATED
  }

  const signed = await prisma.contract.update({
    where: { id: contract.id },
    data: { status: "ACTIVE", signedAt: new Date() },
  });

  await writeAudit({
    action: "contract.signed",
    entityType: "Contract",
    entityId: contract.id,
    actorId: meta?.userId ?? null,
    ip: meta?.ip ?? null,
    metadata: { repId, signatory: parsed.fullName, type: "SALES_REP_COMMISSION" },
  });

  // Generate a PDF copy of the signed agreement, store it on the contract (documentUrl), and email
  // it to the rep. Fail-soft: the agreement is already ACTIVE — none of this should block signing.
  await deliverSignedAgreement(repId, signed, parsed.fullName, meta).catch((err) =>
    console.error(`[rep:contract] post-sign PDF/email failed for ${repId}`, err),
  );

  return signed;
}

/**
 * After a rep signs: render the agreement to a PDF, persist it to object storage and onto
 * `Contract.documentUrl` (so the rep can re-download later), and email them the copy. Every step is
 * best-effort — a storage/email outage must not undo a completed signature.
 */
async function deliverSignedAgreement(
  repId: string,
  signed: { id: string; title: string; signedAt: Date | null },
  signatory: string,
  meta?: { userId?: string; ip?: string | null },
): Promise<void> {
  const rep = await prisma.employee.findUnique({
    where: { id: repId },
    select: { user: { select: { name: true, email: true } } },
  });
  const email = rep?.user?.email;
  if (!email) return; // nowhere to send / nobody to name — skip silently

  const terms = await getCommissionTerms();
  const resourcesUrl = `${appBase()}/rep/resources`;
  const pdf = await renderAgreementPdf({
    repName: rep.user?.name ?? signatory,
    repEmail: email,
    signatoryName: signatory,
    signedAt: signed.signedAt ?? new Date(),
    contractTitle: signed.title,
    auditRef: signed.id,
    ip: meta?.ip ?? null,
    resourcesUrl,
    terms,
  });

  // Store on the account — random token in the path makes the public URL a non-guessable capability link.
  const path = `reps/${repId}/agreement-${signed.id}-${randomBytes(8).toString("hex")}.pdf`;
  const url = await uploadPublicFile(path, pdf, "application/pdf");
  if (url) {
    await prisma.contract.update({ where: { id: signed.id }, data: { documentUrl: url } });
  }

  await sendRepContractSigned(email, {
    name: rep.user?.name,
    portalUrl: `${appBase()}/rep/contract`,
    pdf: { filename: agreementPdfFilename(), content: pdf },
    userId: meta?.userId,
  });
}
