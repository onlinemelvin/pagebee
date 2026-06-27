import { describe, it, expect, vi } from "vitest";
import { prismaMock } from "@/test/setup";

import { getChatConfig, setChatConfig, isChatLive, DEFAULT_CHAT_CONFIG, DEFAULT_GREETING } from "./config";

// ── getChatConfig ────────────────────────────────────────────────────────────

describe("getChatConfig", () => {
  it("returns defaults when no clientSetting row exists", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue(null);
    const cfg = await getChatConfig("c1");
    expect(cfg).toEqual(DEFAULT_CHAT_CONFIG);
  });

  it("returns defaults when aiSettings has no chat key", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue({ aiSettings: {} });
    const cfg = await getChatConfig("c1");
    expect(cfg).toEqual(DEFAULT_CHAT_CONFIG);
  });

  it("returns persisted values when they are valid", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue({
      aiSettings: { chat: { enabled: true, greeting: "Hello!", escalationTimeoutMinutes: 10 } },
    });
    const cfg = await getChatConfig("c1");
    expect(cfg).toEqual({ enabled: true, greeting: "Hello!", escalationTimeoutMinutes: 10 });
  });

  it("clamps escalationTimeoutMinutes below minimum to 1", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue({
      aiSettings: { chat: { enabled: false, greeting: "Hi", escalationTimeoutMinutes: 0 } },
    });
    const cfg = await getChatConfig("c1");
    expect(cfg.escalationTimeoutMinutes).toBe(1);
  });

  it("clamps escalationTimeoutMinutes above maximum to 120", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue({
      aiSettings: { chat: { enabled: true, greeting: "Hi", escalationTimeoutMinutes: 999 } },
    });
    const cfg = await getChatConfig("c1");
    expect(cfg.escalationTimeoutMinutes).toBe(120);
  });

  it("falls back to default greeting when greeting is blank", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue({
      aiSettings: { chat: { enabled: true, greeting: "   ", escalationTimeoutMinutes: 5 } },
    });
    const cfg = await getChatConfig("c1");
    expect(cfg.greeting).toBe(DEFAULT_GREETING);
  });

  it("returns defaults and does not throw when the DB call fails", async () => {
    prismaMock.clientSetting.findUnique.mockRejectedValue(new Error("db down"));
    const cfg = await getChatConfig("c1");
    expect(cfg).toEqual(DEFAULT_CHAT_CONFIG);
  });
});

// ── setChatConfig ────────────────────────────────────────────────────────────

describe("setChatConfig", () => {
  it("upserts the merged config and returns it", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue(null);
    prismaMock.clientSetting.upsert.mockResolvedValue({} as never);

    const result = await setChatConfig("c1", { enabled: true, escalationTimeoutMinutes: 15 });

    expect(result.enabled).toBe(true);
    expect(result.escalationTimeoutMinutes).toBe(15);
    expect(result.greeting).toBe(DEFAULT_GREETING); // kept from defaults
    expect(prismaMock.clientSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: "c1" } }),
    );
  });

  it("merges patch into existing aiSettings without overwriting other keys", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue({
      aiSettings: { chat: { enabled: true, greeting: "Hey!", escalationTimeoutMinutes: 5 }, other: "data" },
    });
    prismaMock.clientSetting.upsert.mockResolvedValue({} as never);

    await setChatConfig("c1", { greeting: "New greeting" });

    const call = prismaMock.clientSetting.upsert.mock.calls[0][0] as { update: { aiSettings: Record<string, unknown> } };
    const ai = call.update.aiSettings as Record<string, unknown>;
    expect((ai as { other?: string }).other).toBe("data");
    expect((ai.chat as { greeting?: string })?.greeting).toBe("New greeting");
  });
});

// ── isChatLive ───────────────────────────────────────────────────────────────

describe("isChatLive", () => {
  it("returns false when plan lacks aiAssistant flag", async () => {
    prismaMock.client.findUnique.mockResolvedValue({ subscription: { plan: { featureFlags: {} } } });
    prismaMock.clientSetting.findUnique.mockResolvedValue({ aiSettings: { chat: { enabled: true, escalationTimeoutMinutes: 5, greeting: "Hi" } } });
    expect(await isChatLive("c1")).toBe(false);
  });

  it("returns false when aiAssistant is on but owner disabled chat", async () => {
    prismaMock.client.findUnique.mockResolvedValue({ subscription: { plan: { featureFlags: { aiAssistant: true } } } });
    prismaMock.clientSetting.findUnique.mockResolvedValue({ aiSettings: { chat: { enabled: false, escalationTimeoutMinutes: 5, greeting: "Hi" } } });
    expect(await isChatLive("c1")).toBe(false);
  });

  it("returns true when aiAssistant is on and owner enabled chat", async () => {
    prismaMock.client.findUnique.mockResolvedValue({ subscription: { plan: { featureFlags: { aiAssistant: true } } } });
    prismaMock.clientSetting.findUnique.mockResolvedValue({ aiSettings: { chat: { enabled: true, escalationTimeoutMinutes: 5, greeting: "Hi" } } });
    expect(await isChatLive("c1")).toBe(true);
  });

  it("returns true in showcase mode even when owner disabled chat (preview of higher tier)", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue({ aiSettings: { chat: { enabled: false, escalationTimeoutMinutes: 5, greeting: "Hi" } } });
    expect(await isChatLive("c1", { flags: { aiAssistant: true }, showcase: true })).toBe(true);
  });

  it("returns false in showcase mode when flag missing", async () => {
    expect(await isChatLive("c1", { flags: {}, showcase: true })).toBe(false);
  });

  it("uses the planOverride flags directly, skipping the DB client lookup", async () => {
    // No mock for client.findUnique — would throw if called
    prismaMock.clientSetting.findUnique.mockResolvedValue({ aiSettings: { chat: { enabled: false, escalationTimeoutMinutes: 5, greeting: "Hi" } } });
    expect(await isChatLive("c1", { flags: { aiAssistant: true }, showcase: false })).toBe(false);
    expect(prismaMock.client.findUnique).not.toHaveBeenCalled();
  });
});
