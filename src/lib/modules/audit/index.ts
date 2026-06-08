import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/**
 * Append-only audit trail. Every sensitive mutation writes one row.
 * Failures are logged but never block the originating action.
 */
export async function writeAudit(entry: {
  action: string;
  entityType: string;
  entityId?: string | null;
  actorId?: string | null;
  clientId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        actorId: entry.actorId ?? null,
        clientId: entry.clientId ?? null,
        metadata: entry.metadata,
        ipAddress: entry.ip ?? null,
      },
    });
  } catch (err) {
    console.error("[audit] failed to write audit log", err);
  }
}
