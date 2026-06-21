import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { getDomainState } from "@/lib/modules/website/domain";
import { createResendDomain, getResendDomain, verifyResendDomain, deleteResendDomain } from "@/lib/resend/domains";
import { writeAudit } from "@/lib/modules/audit";

export class SendingDomainError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

/** The registrable host we send a client's customer email from = their primary domain, www stripped. */
function deriveSendingDomain(primaryHost: string): string {
  return primaryHost.replace(/^www\./, "").toLowerCase();
}

/** Current sending-domain record for a client (or null). */
export function getSendingDomain(clientId: string) {
  return prisma.sendingDomain.findFirst({ where: { clientId }, orderBy: { createdAt: "desc" } });
}

/**
 * Begin sending-domain verification for a client: register their active custom
 * domain in Resend and persist the DKIM/SPF records they must add. Requires an
 * active custom domain (CONNECT/AUTOMATE who've connected one). Idempotent — a
 * second call refreshes the records from Resend.
 */
export async function provisionSendingDomain(clientId: string) {
  const domainState = await getDomainState(clientId);
  if (!domainState || domainState.status !== "active" || !domainState.domain) {
    throw new SendingDomainError(400, "no_active_custom_domain");
  }
  const domain = deriveSendingDomain(domainState.domain);

  // Tenant isolation: reject if ANOTHER client already owns this sending host.
  // (Without this, the upsert below could silently rewrite clientId and steal it.)
  const conflict = await prisma.sendingDomain.findFirst({
    where: { domain, clientId: { not: clientId } },
    select: { id: true },
  });
  if (conflict) throw new SendingDomainError(409, "domain_taken");

  // Reuse this client's existing row for the domain if present.
  const existing = await prisma.sendingDomain.findUnique({ where: { clientId_domain: { clientId, domain } } });
  if (existing?.resendDomainId) {
    const remote = await getResendDomain(existing.resendDomainId);
    if (!("error" in remote)) {
      return prisma.sendingDomain.update({
        where: { id: existing.id },
        data: { records: remote.records as unknown as Prisma.InputJsonValue, status: mapStatus(remote.status) },
      });
    }
    return existing;
  }

  const created = await createResendDomain(domain);
  if ("error" in created) throw new SendingDomainError(502, created.error);

  const row = await prisma.sendingDomain.upsert({
    where: { clientId_domain: { clientId, domain } },
    create: {
      clientId,
      domain,
      resendDomainId: created.id,
      status: mapStatus(created.status),
      records: created.records as unknown as Prisma.InputJsonValue,
    },
    update: {
      resendDomainId: created.id,
      status: mapStatus(created.status),
      records: created.records as unknown as Prisma.InputJsonValue,
      lastError: null,
    },
  });
  await writeAudit({ action: "email.sending_domain_provisioned", entityType: "Client", entityId: clientId, clientId, metadata: { domain } });
  return row;
}

function mapStatus(resendStatus: string): "PENDING" | "VERIFIED" | "FAILED" {
  if (resendStatus === "verified") return "VERIFIED";
  if (resendStatus === "failed") return "FAILED";
  return "PENDING";
}

/** Re-check one sending domain against Resend; flips to VERIFIED when DNS resolves. */
export async function checkSendingDomain(id: string) {
  const row = await prisma.sendingDomain.findUnique({ where: { id } });
  if (!row?.resendDomainId) return row;

  await verifyResendDomain(row.resendDomainId); // nudge Resend to re-check
  const remote = await getResendDomain(row.resendDomainId);
  if ("error" in remote) {
    return prisma.sendingDomain.update({ where: { id }, data: { lastError: remote.error } });
  }
  const status = mapStatus(remote.status);
  const updated = await prisma.sendingDomain.update({
    where: { id },
    data: {
      status,
      records: remote.records as unknown as Prisma.InputJsonValue,
      lastError: null,
      ...(status === "VERIFIED" && !row.verifiedAt ? { verifiedAt: new Date() } : {}),
    },
  });
  if (status === "VERIFIED" && !row.verifiedAt) {
    await writeAudit({ action: "email.sending_domain_verified", entityType: "Client", entityId: row.clientId, clientId: row.clientId, metadata: { domain: row.domain } });
  }
  return updated;
}

/** Worker sweep: poll all PENDING sending domains until verified. */
export async function sweepSendingDomains(): Promise<{ checked: number; verified: number }> {
  const pending = await prisma.sendingDomain.findMany({ where: { status: "PENDING" }, select: { id: true }, take: 100 });
  let verified = 0;
  for (const d of pending) {
    try {
      const r = await checkSendingDomain(d.id);
      if (r?.status === "VERIFIED") verified++;
    } catch (err) {
      console.error(`[email:sending-domain] check failed for ${d.id}`, err);
    }
  }
  return { checked: pending.length, verified };
}

/** Remove a client's sending domain (revert to the shared domain). */
export async function removeSendingDomain(clientId: string) {
  const row = await prisma.sendingDomain.findFirst({ where: { clientId } });
  if (!row) return;
  if (row.resendDomainId) await deleteResendDomain(row.resendDomainId);
  await prisma.sendingDomain.delete({ where: { id: row.id } });
}
