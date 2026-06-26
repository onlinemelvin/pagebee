import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizePhone } from "./optout";

/**
 * Owner SMS-alert preferences. Persisted in `ClientSetting.smsSettings.notifications` (JSON).
 * Unlike email (on by default), SMS is strictly OPT-IN — `enabled` defaults to false and stays off
 * until the owner turns it on and provides a phone number. Only the time-sensitive groups are worth
 * a text, so we expose inquiries + appointments (not billing/website).
 */
export type SmsGroup = "inquiries" | "appointments";

export interface SmsPrefs {
  enabled: boolean; // master SMS switch (opt-in)
  phone: string | null; // E.164 number alerts are sent to
  inquiries: boolean;
  appointments: boolean;
}

export const DEFAULT_SMS_PREFS: SmsPrefs = { enabled: false, phone: null, inquiries: true, appointments: true };

function coerce(raw: unknown): SmsPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return {
    enabled: bool(r.enabled, false),
    phone: typeof r.phone === "string" && r.phone ? r.phone : null,
    inquiries: bool(r.inquiries, true),
    appointments: bool(r.appointments, true),
  };
}

/** Read a client's SMS-alert preferences (defaults when unset). */
export async function getSmsPrefs(clientId: string): Promise<SmsPrefs> {
  const row = await prisma.clientSetting.findUnique({ where: { clientId }, select: { smsSettings: true } }).catch(() => null);
  const sms = (row?.smsSettings ?? {}) as Record<string, unknown>;
  return coerce(sms.notifications);
}

/** Persist SMS-alert preferences (merges into smsSettings). Normalizes the phone to E.164. */
export async function setSmsPrefs(clientId: string, prefs: Partial<SmsPrefs>): Promise<SmsPrefs> {
  const existing = await prisma.clientSetting.findUnique({ where: { clientId }, select: { smsSettings: true } });
  const sms = (existing?.smsSettings ?? {}) as Record<string, unknown>;
  const incoming = { ...prefs };
  if (typeof incoming.phone === "string") incoming.phone = normalizePhone(incoming.phone);
  const merged = coerce({ ...coerce(sms.notifications), ...incoming });
  // Can't enable alerts without a destination number.
  if (merged.enabled && !merged.phone) merged.enabled = false;
  const nextSms = { ...sms, notifications: merged } as unknown as Prisma.InputJsonValue;
  await prisma.clientSetting.upsert({
    where: { clientId },
    update: { smsSettings: nextSms },
    create: { clientId, smsSettings: nextSms },
  });
  return merged;
}

/** Whether an SMS alert in `group` should be sent for this client (opted in + has number + group on). */
export async function isSmsGroupAllowed(clientId: string, group: SmsGroup): Promise<boolean> {
  const prefs = await getSmsPrefs(clientId);
  return prefs.enabled && !!prefs.phone && prefs[group] !== false;
}
