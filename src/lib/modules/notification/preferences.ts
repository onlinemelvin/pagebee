import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { EmailCategory } from "@prisma/client";
import { NOTIFICATION_GROUPS, type NotificationGroup, groupForCategory, NOTIF_META } from "./meta";

/**
 * Owner email-notification preferences. Persisted in
 * `ClientSetting.emailSettings.notifications` (JSON) — `enabled` is a master
 * switch, plus a per-group toggle. Defaults to ALL ON so existing behaviour
 * (owners receive activity emails) is unchanged until they opt out.
 *
 * In-app (dashboard) notifications are NOT affected by these toggles — they're
 * always recorded; only the email copy is gated.
 */
export interface NotificationPrefs {
  enabled: boolean; // master email switch
  inquiries: boolean;
  appointments: boolean;
  billing: boolean;
  website: boolean;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  enabled: true,
  inquiries: true,
  appointments: true,
  billing: true,
  website: true,
};

function coerce(raw: unknown): NotificationPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return {
    enabled: bool(r.enabled, true),
    inquiries: bool(r.inquiries, true),
    appointments: bool(r.appointments, true),
    billing: bool(r.billing, true),
    website: bool(r.website, true),
  };
}

/** Read a client's email-notification preferences (defaults when unset). */
export async function getNotificationPrefs(clientId: string): Promise<NotificationPrefs> {
  const row = await prisma.clientSetting
    .findUnique({ where: { clientId }, select: { emailSettings: true } })
    .catch(() => null);
  const email = (row?.emailSettings ?? {}) as Record<string, unknown>;
  return coerce(email.notifications);
}

/** Persist a client's email-notification preferences (merges into emailSettings). */
export async function setNotificationPrefs(clientId: string, prefs: Partial<NotificationPrefs>): Promise<NotificationPrefs> {
  const existing = await prisma.clientSetting.findUnique({ where: { clientId }, select: { emailSettings: true } });
  const email = (existing?.emailSettings ?? {}) as Record<string, unknown>;
  const merged = coerce({ ...coerce(email.notifications), ...prefs });
  const nextEmail = { ...email, notifications: merged } as unknown as Prisma.InputJsonValue;
  await prisma.clientSetting.upsert({
    where: { clientId },
    update: { emailSettings: nextEmail },
    create: { clientId, emailSettings: nextEmail },
  });
  return merged;
}

/** Whether an email in `group` is allowed for this client. `null` group = always. */
export async function isGroupEmailAllowed(clientId: string, group: NotificationGroup | null): Promise<boolean> {
  if (group === null) return true; // critical / security / onboarding — never silenced
  const prefs = await getNotificationPrefs(clientId);
  return prefs.enabled && prefs[group] !== false;
}

/**
 * Gate for the email funnel (toClient): allow when the message's notification
 * type (preferred) or — failing that — its email category resolves to an
 * opted-in group. Critical messages (group null) always send.
 */
export async function isEmailAllowed(clientId: string, category: EmailCategory, type?: string): Promise<boolean> {
  const group = type && NOTIF_META[type] ? NOTIF_META[type].group : groupForCategory(category);
  return isGroupEmailAllowed(clientId, group);
}

export { NOTIFICATION_GROUPS };
