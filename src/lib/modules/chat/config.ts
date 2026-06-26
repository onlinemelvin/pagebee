import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * AI chat configuration, persisted in `ClientSetting.aiSettings.chat` (JSON — no schema column).
 * `enabled` is the owner's on/off for the website widget (on top of the `aiAssistant` plan flag);
 * `escalationTimeoutMinutes` is how long the AI waits for a human before handing off to a lead.
 */
export interface ChatConfig {
  enabled: boolean;
  greeting: string;
  escalationTimeoutMinutes: number;
}

export const DEFAULT_GREETING = "Hi! 👋 Ask me anything about our services, hours, or pricing — or I can help you book an appointment.";

export const DEFAULT_CHAT_CONFIG: ChatConfig = {
  enabled: false,
  greeting: DEFAULT_GREETING,
  escalationTimeoutMinutes: 5,
};

function coerce(raw: unknown): ChatConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const timeout = Number(r.escalationTimeoutMinutes);
  return {
    enabled: r.enabled === true,
    greeting: typeof r.greeting === "string" && r.greeting.trim() ? r.greeting : DEFAULT_GREETING,
    escalationTimeoutMinutes: Number.isFinite(timeout) ? Math.min(120, Math.max(1, Math.round(timeout))) : 5,
  };
}

/**
 * Whether the website chat widget is live for a tenant: the plan includes `aiAssistant` AND the
 * owner turned chat on. `planOverride` (preview) gates against the previewed tier; `showcase`
 * (previewing a HIGHER tier) shows it regardless of the owner toggle — mirrors leadCaptureEnabled.
 */
export async function isChatLive(clientId: string, planOverride?: { flags: Record<string, unknown>; showcase: boolean }): Promise<boolean> {
  let flags = planOverride?.flags;
  if (!flags) {
    const c = await prisma.client.findUnique({ where: { id: clientId }, select: { subscription: { select: { plan: { select: { featureFlags: true } } } } } });
    flags = (c?.subscription?.plan.featureFlags ?? {}) as Record<string, unknown>;
  }
  if (!flags.aiAssistant) return false;
  if (planOverride?.showcase) return true;
  return (await getChatConfig(clientId)).enabled;
}

/** Read a client's chat config (defaults when unset). */
export async function getChatConfig(clientId: string): Promise<ChatConfig> {
  const row = await prisma.clientSetting.findUnique({ where: { clientId }, select: { aiSettings: true } }).catch(() => null);
  const ai = (row?.aiSettings ?? {}) as Record<string, unknown>;
  return coerce(ai.chat);
}

/** Persist chat config (merges into aiSettings.chat). */
export async function setChatConfig(clientId: string, patch: Partial<ChatConfig>): Promise<ChatConfig> {
  const existing = await prisma.clientSetting.findUnique({ where: { clientId }, select: { aiSettings: true } });
  const ai = (existing?.aiSettings ?? {}) as Record<string, unknown>;
  const merged = coerce({ ...coerce(ai.chat), ...patch });
  const nextAi = { ...ai, chat: merged } as unknown as Prisma.InputJsonValue;
  await prisma.clientSetting.upsert({
    where: { clientId },
    update: { aiSettings: nextAi },
    create: { clientId, aiSettings: nextAi },
  });
  return merged;
}
