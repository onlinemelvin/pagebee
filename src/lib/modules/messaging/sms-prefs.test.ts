import { describe, it, expect } from "vitest";
import { prismaMock } from "@/test/setup";

import { getSmsPrefs, setSmsPrefs, isSmsGroupAllowed, DEFAULT_SMS_PREFS } from "./sms-prefs";

// ── getSmsPrefs ──────────────────────────────────────────────────────────────

describe("getSmsPrefs", () => {
  it("returns defaults when no row exists", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue(null);
    expect(await getSmsPrefs("c1")).toEqual(DEFAULT_SMS_PREFS);
  });

  it("returns defaults when smsSettings has no notifications key", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue({ smsSettings: {} });
    expect(await getSmsPrefs("c1")).toEqual(DEFAULT_SMS_PREFS);
  });

  it("returns persisted values", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue({
      smsSettings: { notifications: { enabled: true, phone: "+15551234567", inquiries: true, appointments: false } },
    });
    const prefs = await getSmsPrefs("c1");
    expect(prefs.enabled).toBe(true);
    expect(prefs.phone).toBe("+15551234567");
    expect(prefs.appointments).toBe(false);
  });

  it("returns defaults and does not throw when the DB call fails", async () => {
    prismaMock.clientSetting.findUnique.mockRejectedValue(new Error("db down"));
    expect(await getSmsPrefs("c1")).toEqual(DEFAULT_SMS_PREFS);
  });

  it("coerces non-boolean enabled to false", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue({
      smsSettings: { notifications: { enabled: "yes", phone: "+15559999999" } },
    });
    const prefs = await getSmsPrefs("c1");
    expect(prefs.enabled).toBe(false); // "yes" is not a boolean
  });
});

// ── setSmsPrefs ──────────────────────────────────────────────────────────────

describe("setSmsPrefs", () => {
  it("upserts and returns merged prefs", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue(null);
    prismaMock.clientSetting.upsert.mockResolvedValue({} as never);

    const result = await setSmsPrefs("c1", { enabled: true, phone: "+15551234567" });

    expect(result.enabled).toBe(true);
    expect(result.phone).toBe("+15551234567");
    expect(prismaMock.clientSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: "c1" } }),
    );
  });

  it("normalizes the phone number to E.164 before persisting", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue(null);
    prismaMock.clientSetting.upsert.mockResolvedValue({} as never);

    const result = await setSmsPrefs("c1", { enabled: true, phone: "(555) 123-4567" });

    expect(result.phone).toBe("+15551234567");
  });

  it("forces enabled=false when phone is null (cannot enable without a number)", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue(null);
    prismaMock.clientSetting.upsert.mockResolvedValue({} as never);

    const result = await setSmsPrefs("c1", { enabled: true, phone: null });

    expect(result.enabled).toBe(false);
  });

  it("forces enabled=false when phone normalizes to null (invalid number)", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue(null);
    prismaMock.clientSetting.upsert.mockResolvedValue({} as never);

    const result = await setSmsPrefs("c1", { enabled: true, phone: "123" }); // too short

    expect(result.enabled).toBe(false);
    expect(result.phone).toBeNull();
  });

  it("merges patch into existing preferences without overwriting other keys", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue({
      smsSettings: {
        notifications: { enabled: true, phone: "+15551234567", inquiries: true, appointments: true },
        other: "data",
      },
    });
    prismaMock.clientSetting.upsert.mockResolvedValue({} as never);

    const result = await setSmsPrefs("c1", { appointments: false });

    expect(result.enabled).toBe(true); // preserved
    expect(result.phone).toBe("+15551234567"); // preserved
    expect(result.appointments).toBe(false); // patched
    expect(result.inquiries).toBe(true); // preserved

    // The 'other' key in smsSettings must be preserved too
    const call = prismaMock.clientSetting.upsert.mock.calls[0][0] as { update: { smsSettings: Record<string, unknown> } };
    expect((call.update.smsSettings as Record<string, unknown>).other).toBe("data");
  });
});

// ── isSmsGroupAllowed ─────────────────────────────────────────────────────────

describe("isSmsGroupAllowed", () => {
  it("returns false when SMS is disabled (master switch off)", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue({
      smsSettings: { notifications: { enabled: false, phone: "+15551234567", inquiries: true, appointments: true } },
    });
    expect(await isSmsGroupAllowed("c1", "inquiries")).toBe(false);
  });

  it("returns false when there is no phone number", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue({
      smsSettings: { notifications: { enabled: true, phone: null, inquiries: true, appointments: true } },
    });
    expect(await isSmsGroupAllowed("c1", "inquiries")).toBe(false);
  });

  it("returns false when the specific group is toggled off", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue({
      smsSettings: { notifications: { enabled: true, phone: "+15551234567", inquiries: false, appointments: true } },
    });
    expect(await isSmsGroupAllowed("c1", "inquiries")).toBe(false);
  });

  it("returns true when enabled, has phone, and group is on", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue({
      smsSettings: { notifications: { enabled: true, phone: "+15551234567", inquiries: true, appointments: true } },
    });
    expect(await isSmsGroupAllowed("c1", "inquiries")).toBe(true);
    expect(await isSmsGroupAllowed("c1", "appointments")).toBe(true);
  });

  it("returns false when prefs are defaults (opted out by default)", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue(null);
    expect(await isSmsGroupAllowed("c1", "inquiries")).toBe(false);
  });
});
