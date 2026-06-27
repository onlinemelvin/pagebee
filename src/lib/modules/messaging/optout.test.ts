import { describe, it, expect } from "vitest";
import { prismaMock } from "@/test/setup";

import { classifyInbound, normalizePhone, isOptedOut, recordOptOut, recordOptIn } from "./optout";

// ── classifyInbound ──────────────────────────────────────────────────────────

describe("classifyInbound", () => {
  it.each([
    ["stop", "stop"],
    ["STOP", "stop"],
    ["STOPALL", "stop"],
    ["stopall", "stop"],
    ["unsubscribe", "stop"],
    ["UNSUBSCRIBE", "stop"],
    ["cancel", "stop"],
    ["end", "stop"],
    ["quit", "stop"],
    ["stop all", "stop"],
    ["STOP ALL", "stop"],
  ] as const)("classifies '%s' as stop", (input, expected) => {
    expect(classifyInbound(input)).toBe(expected);
  });

  it.each([
    ["start", "start"],
    ["START", "start"],
    ["unstop", "start"],
    ["UNSTOP", "start"],
    ["yes", "start"],
    ["YES", "start"],
    ["resume", "start"],
  ] as const)("classifies '%s' as start", (input, expected) => {
    expect(classifyInbound(input)).toBe(expected);
  });

  it.each([
    ["help", "help"],
    ["HELP", "help"],
    ["info", "help"],
    ["INFO", "help"],
  ] as const)("classifies '%s' as help", (input, expected) => {
    expect(classifyInbound(input)).toBe(expected);
  });

  it.each([
    ["hello"],
    ["I need help with my booking"],
    ["stop being so slow"],
    [""],
    ["  "],
  ])("returns null for non-keyword '%s'", (input) => {
    expect(classifyInbound(input)).toBeNull();
  });

  it("is case-insensitive and handles surrounding whitespace", () => {
    expect(classifyInbound("  STOP  ")).toBe("stop");
    expect(classifyInbound("  Start  ")).toBe("start");
  });
});

// ── normalizePhone ───────────────────────────────────────────────────────────

describe("normalizePhone", () => {
  it("returns null for null/undefined input", () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(normalizePhone("")).toBeNull();
  });

  it("returns null for strings with fewer than 7 digits", () => {
    expect(normalizePhone("123456")).toBeNull();
    expect(normalizePhone("+1234")).toBeNull();
  });

  it("normalizes a bare 10-digit number to +1 (US/Canada)", () => {
    expect(normalizePhone("5551234567")).toBe("+15551234567");
  });

  it("normalizes a 10-digit number with formatting", () => {
    expect(normalizePhone("(555) 123-4567")).toBe("+15551234567");
    expect(normalizePhone("555-123-4567")).toBe("+15551234567");
    expect(normalizePhone("555.123.4567")).toBe("+15551234567");
  });

  it("normalizes an 11-digit US number starting with 1", () => {
    expect(normalizePhone("15551234567")).toBe("+15551234567");
  });

  it("preserves a number already in E.164 format", () => {
    expect(normalizePhone("+15551234567")).toBe("+15551234567");
  });

  it("preserves international E.164 numbers (non-US)", () => {
    expect(normalizePhone("+447911123456")).toBe("+447911123456");
  });

  it("strips spaces and dashes from an E.164 number", () => {
    expect(normalizePhone("+1 555 123-4567")).toBe("+15551234567");
  });
});

// ── isOptedOut ───────────────────────────────────────────────────────────────

describe("isOptedOut", () => {
  it("returns false for null/undefined/bad input (safe on bad input)", async () => {
    expect(await isOptedOut(null)).toBe(false);
    expect(await isOptedOut(undefined)).toBe(false);
    expect(await isOptedOut("123")).toBe(false); // too short → normalizePhone returns null
  });

  it("returns true when the number is in the SmsOptOut table", async () => {
    prismaMock.smsOptOut.findUnique.mockResolvedValue({ id: "opt1" });
    expect(await isOptedOut("+15551234567")).toBe(true);
  });

  it("returns false when the number is not in the SmsOptOut table", async () => {
    prismaMock.smsOptOut.findUnique.mockResolvedValue(null);
    expect(await isOptedOut("+15551234567")).toBe(false);
  });

  it("returns false (not true) when the DB call throws", async () => {
    prismaMock.smsOptOut.findUnique.mockRejectedValue(new Error("db down"));
    expect(await isOptedOut("+15551234567")).toBe(false);
  });

  it("looks up the normalized E.164 form of the number", async () => {
    prismaMock.smsOptOut.findUnique.mockResolvedValue(null);
    await isOptedOut("5551234567");
    expect(prismaMock.smsOptOut.findUnique).toHaveBeenCalledWith({ where: { phone: "+15551234567" }, select: { id: true } });
  });
});

// ── recordOptOut ─────────────────────────────────────────────────────────────

describe("recordOptOut", () => {
  it("upserts the suppression row for a valid number", async () => {
    prismaMock.smsOptOut.upsert.mockResolvedValue({} as never);

    await recordOptOut("+15551234567");

    expect(prismaMock.smsOptOut.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { phone: "+15551234567" },
        create: expect.objectContaining({ phone: "+15551234567" }),
      }),
    );
  });

  it("normalizes the phone before upserting", async () => {
    prismaMock.smsOptOut.upsert.mockResolvedValue({} as never);

    await recordOptOut("(555) 111-2222");

    expect(prismaMock.smsOptOut.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { phone: "+15551112222" } }),
    );
  });

  it("does nothing when the phone is invalid", async () => {
    await recordOptOut("123"); // too short
    expect(prismaMock.smsOptOut.upsert).not.toHaveBeenCalled();
  });

  it("stores clientId and reason when provided", async () => {
    prismaMock.smsOptOut.upsert.mockResolvedValue({} as never);

    await recordOptOut("+15551234567", { clientId: "c1", reason: "admin" });

    expect(prismaMock.smsOptOut.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ clientId: "c1", reason: "admin" }),
      }),
    );
  });

  it("is idempotent (upsert on existing row just updates reason)", async () => {
    prismaMock.smsOptOut.upsert.mockResolvedValue({} as never);
    await recordOptOut("+15551234567");
    await recordOptOut("+15551234567");
    expect(prismaMock.smsOptOut.upsert).toHaveBeenCalledTimes(2);
  });
});

// ── recordOptIn ──────────────────────────────────────────────────────────────

describe("recordOptIn", () => {
  it("deletes the suppression row for the normalized number (START keyword)", async () => {
    prismaMock.smsOptOut.deleteMany.mockResolvedValue({ count: 1 });

    await recordOptIn("5551234567");

    expect(prismaMock.smsOptOut.deleteMany).toHaveBeenCalledWith({ where: { phone: "+15551234567" } });
  });

  it("is idempotent when the number was never suppressed (deleteMany count=0)", async () => {
    prismaMock.smsOptOut.deleteMany.mockResolvedValue({ count: 0 });

    await recordOptIn("+15551234567"); // should not throw
    expect(prismaMock.smsOptOut.deleteMany).toHaveBeenCalled();
  });

  it("does nothing for an invalid phone", async () => {
    await recordOptIn("bad");
    expect(prismaMock.smsOptOut.deleteMany).not.toHaveBeenCalled();
  });
});
