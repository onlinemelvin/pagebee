import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

import { getNotificationPrefs, setNotificationPrefs, isGroupEmailAllowed, isEmailAllowed, DEFAULT_PREFS } from "./preferences";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getNotificationPrefs", () => {
  it("returns all-true defaults when no ClientSetting row exists", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue(null);
    const prefs = await getNotificationPrefs("c1");
    expect(prefs).toEqual(DEFAULT_PREFS);
  });

  it("returns all-true defaults when emailSettings has no notifications key", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue({ emailSettings: {} });
    const prefs = await getNotificationPrefs("c1");
    expect(prefs).toEqual(DEFAULT_PREFS);
  });

  it("returns the stored prefs when they exist", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue({
      emailSettings: { notifications: { enabled: false, inquiries: false, appointments: true, billing: true, website: true } },
    });
    const prefs = await getNotificationPrefs("c1");
    expect(prefs.enabled).toBe(false);
    expect(prefs.inquiries).toBe(false);
    expect(prefs.appointments).toBe(true);
  });

  it("defaults individual flags to true when the stored object is partial", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue({
      emailSettings: { notifications: { enabled: true } }, // all group flags missing
    });
    const prefs = await getNotificationPrefs("c1");
    expect(prefs.billing).toBe(true);
    expect(prefs.website).toBe(true);
  });

  it("returns defaults when the DB call throws (fail-safe catch)", async () => {
    prismaMock.clientSetting.findUnique.mockRejectedValue(new Error("db error"));
    const prefs = await getNotificationPrefs("c1");
    expect(prefs).toEqual(DEFAULT_PREFS);
  });
});

describe("setNotificationPrefs", () => {
  it("merges the partial update into existing prefs and upserts", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue({
      emailSettings: {
        notifications: { enabled: true, inquiries: true, appointments: true, billing: true, website: true },
      },
    });
    prismaMock.clientSetting.upsert.mockResolvedValue({} as never);

    const result = await setNotificationPrefs("c1", { inquiries: false });

    expect(result.inquiries).toBe(false);
    expect(result.billing).toBe(true); // untouched
    expect(prismaMock.clientSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: "c1" } }),
    );
  });

  it("creates from defaults when no setting row exists yet", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue(null);
    prismaMock.clientSetting.upsert.mockResolvedValue({} as never);

    const result = await setNotificationPrefs("c1", { enabled: false });
    expect(result.enabled).toBe(false);
    // all groups should remain at their defaults
    expect(result.inquiries).toBe(true);
  });
});

describe("isGroupEmailAllowed", () => {
  it("always returns true for null group (critical / security)", async () => {
    const allowed = await isGroupEmailAllowed("c1", null);
    expect(allowed).toBe(true);
    expect(prismaMock.clientSetting.findUnique).not.toHaveBeenCalled();
  });

  it("returns true when prefs are all-default (opted in)", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue(null); // defaults
    expect(await isGroupEmailAllowed("c1", "inquiries")).toBe(true);
  });

  it("returns false when master enabled is false", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue({
      emailSettings: { notifications: { enabled: false, inquiries: true, appointments: true, billing: true, website: true } },
    });
    expect(await isGroupEmailAllowed("c1", "inquiries")).toBe(false);
  });

  it("returns false when the specific group is opted out", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue({
      emailSettings: { notifications: { enabled: true, inquiries: false, appointments: true, billing: true, website: true } },
    });
    expect(await isGroupEmailAllowed("c1", "inquiries")).toBe(false);
  });

  it("returns true when master is on and the specific group is on", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue({
      emailSettings: { notifications: { enabled: true, inquiries: true, appointments: true, billing: true, website: true } },
    });
    expect(await isGroupEmailAllowed("c1", "billing")).toBe(true);
  });
});

describe("isEmailAllowed", () => {
  it("uses the notification type's group when the type is in the catalog", async () => {
    // lead.created is in NOTIF_META with group "inquiries"
    prismaMock.clientSetting.findUnique.mockResolvedValue({
      emailSettings: { notifications: { enabled: true, inquiries: false, appointments: true, billing: true, website: true } },
    });
    // lead.created → group inquiries → opted out → false
    expect(await isEmailAllowed("c1", "ACCOUNT", "lead.created")).toBe(false);
  });

  it("falls back to groupForCategory when the type is unknown", async () => {
    // unknown type + BILLING category → group billing → all default → true
    prismaMock.clientSetting.findUnique.mockResolvedValue(null); // defaults = all true
    expect(await isEmailAllowed("c1", "BILLING", "unknown_type")).toBe(true);
  });

  it("always allows critical email (null group from category)", async () => {
    // AUTH category → null group → always allowed
    const allowed = await isEmailAllowed("c1", "AUTH");
    expect(allowed).toBe(true);
    expect(prismaMock.clientSetting.findUnique).not.toHaveBeenCalled();
  });
});
