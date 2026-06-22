import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { BuiltEmail } from "@/lib/modules/email/templates";
import { metaForType, type NotificationLevel } from "./meta";

export interface NotificationDTO {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string;
  icon: string;
  level: NotificationLevel;
  read: boolean;
  createdAt: string;
}

interface NotificationPayload {
  title: string;
  body: string | null;
  href: string;
  icon: string;
  level: NotificationLevel;
}

/**
 * THE custom method — call this from anywhere to raise an in-app notification for
 * a client (tenant). Catalog defaults (icon / href / title — see meta.ts) fill in
 * anything not supplied. Always fail-soft: a notification must never break the
 * action that triggered it.
 *
 *   await createNotification({ clientId, type: "preview_ready" });
 *   await createNotification({ clientId, type: "lead.created", body: `New lead from ${name}` });
 *
 * In-app delivery is unconditional; email delivery is handled separately by the
 * email funnel (toClient) and gated by the owner's opt-in preferences.
 */
export async function createNotification(input: {
  clientId: string;
  type: string;
  title?: string;
  body?: string | null;
  href?: string;
  icon?: string;
  level?: NotificationLevel;
  recipientUserId?: string | null;
}): Promise<void> {
  try {
    const meta = metaForType(input.type);
    const payload: NotificationPayload = {
      title: input.title ?? meta.title,
      body: input.body ?? null,
      href: input.href ?? meta.href,
      icon: input.icon ?? meta.icon,
      level: input.level ?? meta.level,
    };
    await prisma.notificationEvent.create({
      data: {
        clientId: input.clientId,
        event: input.type,
        channel: "DASHBOARD",
        recipientId: input.recipientUserId ?? null,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.error(`[notify] failed to create "${input.type}" for client ${input.clientId}`, err);
  }
}

/**
 * Bridge used by the email funnel: turn a built owner email into its in-app
 * twin. Title comes from the catalog (by template key); the body reuses the
 * email's preheader, which is already a tidy one-line summary.
 */
export function createNotificationFromEmail(
  clientId: string,
  recipientUserId: string | null,
  email: BuiltEmail,
): Promise<void> {
  return createNotification({
    clientId,
    type: email.template,
    body: email.preheader || null,
    recipientUserId,
  });
}

function toDTO(row: { id: string; event: string; payload: unknown; readAt: Date | null; createdAt: Date }): NotificationDTO {
  const meta = metaForType(row.event);
  const p = (row.payload ?? {}) as Partial<NotificationPayload>;
  return {
    id: row.id,
    type: row.event,
    title: p.title ?? meta.title,
    body: p.body ?? null,
    href: p.href ?? meta.href,
    icon: p.icon ?? meta.icon,
    level: p.level ?? meta.level,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Recent dashboard notifications for a client (newest first) + the unread count. */
export async function listNotifications(
  clientId: string,
  opts: { limit?: number } = {},
): Promise<{ notifications: NotificationDTO[]; unread: number }> {
  const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
  const [rows, unread] = await Promise.all([
    prisma.notificationEvent.findMany({
      where: { clientId, channel: "DASHBOARD" },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, event: true, payload: true, readAt: true, createdAt: true },
    }),
    prisma.notificationEvent.count({ where: { clientId, channel: "DASHBOARD", readAt: null } }),
  ]);
  return { notifications: rows.map(toDTO), unread };
}

/** Number of unread dashboard notifications for a client. */
export function unreadCount(clientId: string): Promise<number> {
  return prisma.notificationEvent.count({ where: { clientId, channel: "DASHBOARD", readAt: null } });
}

/** Mark specific notifications (scoped to the client) read. */
export async function markRead(clientId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await prisma.notificationEvent.updateMany({
    where: { clientId, channel: "DASHBOARD", id: { in: ids }, readAt: null },
    data: { readAt: new Date() },
  });
}

/** Mark every unread dashboard notification for a client read. */
export async function markAllRead(clientId: string): Promise<void> {
  await prisma.notificationEvent.updateMany({
    where: { clientId, channel: "DASHBOARD", readAt: null },
    data: { readAt: new Date() },
  });
}
