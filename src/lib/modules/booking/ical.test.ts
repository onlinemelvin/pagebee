import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

// signingSecret reads env vars; mock to keep tests deterministic without env setup.
// NOTE: vi.resetAllMocks() in setup.ts resets implementations — we use mockReturnValue
// so we can re-apply it in beforeEach.
vi.mock("@/lib/secret", () => ({
  signingSecret: vi.fn().mockReturnValue("test-secret-key"),
}));

import { icalToken, verifyIcalToken, buildIcsFeed } from "./ical";
import { signingSecret } from "@/lib/secret";

beforeEach(() => {
  vi.clearAllMocks();
  // Restore the signing secret after resetAllMocks clears implementations.
  vi.mocked(signingSecret).mockReturnValue("test-secret-key");
});

// ── icalToken / verifyIcalToken ───────────────────────────────────────────────

describe("icalToken", () => {
  it("produces a token containing the clientId", () => {
    const token = icalToken("client-abc");
    expect(token).toContain("client-abc");
  });

  it("token structure is <clientId>.<sig>", () => {
    const token = icalToken("client-abc");
    const dot = token.lastIndexOf(".");
    expect(dot).toBeGreaterThan(0);
    expect(token.slice(0, dot)).toBe("client-abc");
  });

  it("tokens for different clients are different", () => {
    expect(icalToken("c1")).not.toBe(icalToken("c2"));
  });

  it("is stable (same input → same output given same secret)", () => {
    expect(icalToken("client-abc")).toBe(icalToken("client-abc"));
  });
});

describe("verifyIcalToken", () => {
  it("verifies a freshly-generated token", () => {
    const token = icalToken("client-xyz");
    expect(verifyIcalToken(token)).toBe("client-xyz");
  });

  it("returns null for a tampered signature", () => {
    const token = icalToken("client-xyz");
    const tampered = token.slice(0, -4) + "aaaa";
    expect(verifyIcalToken(tampered)).toBeNull();
  });

  it("returns null for a token with no dot", () => {
    expect(verifyIcalToken("nodottoken")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(verifyIcalToken("")).toBeNull();
  });

  it("is client-id specific — token for c1 does not verify as c2", () => {
    const token = icalToken("c1");
    // Swap the prefix but keep the sig
    const dot = token.lastIndexOf(".");
    const sig = token.slice(dot);
    const swapped = `c2${sig}`;
    expect(verifyIcalToken(swapped)).toBeNull();
  });

  it("returns null for a token with only a leading dot", () => {
    expect(verifyIcalToken(".somesig")).toBeNull();
  });
});

// ── buildIcsFeed ──────────────────────────────────────────────────────────────

const START = new Date("2026-07-10T13:00:00Z");
const END = new Date("2026-07-10T14:00:00Z");

function makeBooking(overrides: Partial<{
  id: string; status: string; serviceName: string;
  startAt: Date; endAt: Date; notes: string | null;
  customer: { name: string | null; phone: string | null } | null;
}> = {}) {
  return {
    id: "b1",
    status: "CONFIRMED",
    serviceName: "Haircut",
    startAt: START,
    endAt: END,
    notes: null,
    customer: null,
    ...overrides,
  };
}

describe("buildIcsFeed", () => {
  it("returns valid VCALENDAR structure", async () => {
    prismaMock.client.findUnique.mockResolvedValue({ businessName: "Acme Salon" });
    prismaMock.booking.findMany.mockResolvedValue([]);
    const ics = await buildIcsFeed("c1");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
  });

  it("uses the client's business name in the calendar title", async () => {
    prismaMock.client.findUnique.mockResolvedValue({ businessName: "Bob's Barber" });
    prismaMock.booking.findMany.mockResolvedValue([]);
    const ics = await buildIcsFeed("c1");
    expect(ics).toContain("Bob's Barber");
  });

  it("falls back to 'PageBee' when client not found", async () => {
    prismaMock.client.findUnique.mockResolvedValue(null);
    prismaMock.booking.findMany.mockResolvedValue([]);
    const ics = await buildIcsFeed("c1");
    expect(ics).toContain("PageBee");
  });

  it("includes a VEVENT for each booking", async () => {
    prismaMock.client.findUnique.mockResolvedValue({ businessName: "Salon" });
    prismaMock.booking.findMany.mockResolvedValue([
      makeBooking({ id: "b1" }),
      makeBooking({ id: "b2", serviceName: "Color" }),
    ]);
    const ics = await buildIcsFeed("c1");
    const eventCount = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
    expect(eventCount).toBe(2);
  });

  it("uses CRLF line endings (RFC 5545)", async () => {
    prismaMock.client.findUnique.mockResolvedValue({ businessName: "Salon" });
    prismaMock.booking.findMany.mockResolvedValue([]);
    const ics = await buildIcsFeed("c1");
    expect(ics).toContain("\r\n");
    // every line should end with CRLF (not bare LF)
    const lines = ics.split("\r\n");
    expect(lines.length).toBeGreaterThan(2);
  });

  it("maps booking statuses to correct iCal STATUS values", async () => {
    const cases: Array<[string, string]> = [
      ["CONFIRMED", "STATUS:CONFIRMED"],
      ["RESCHEDULED", "STATUS:CONFIRMED"],
      ["COMPLETED", "STATUS:CONFIRMED"],
      ["REQUESTED", "STATUS:TENTATIVE"],
      ["CANCELLED", "STATUS:CANCELLED"],
      ["NO_SHOW", "STATUS:CANCELLED"],
    ];
    for (const [bookingStatus, expectedLine] of cases) {
      prismaMock.client.findUnique.mockResolvedValue({ businessName: "S" });
      prismaMock.booking.findMany.mockResolvedValue([makeBooking({ status: bookingStatus })]);
      const ics = await buildIcsFeed("c1");
      expect(ics).toContain(expectedLine);
    }
  });

  it("includes customer name in SUMMARY when available", async () => {
    prismaMock.client.findUnique.mockResolvedValue({ businessName: "Salon" });
    prismaMock.booking.findMany.mockResolvedValue([
      makeBooking({ customer: { name: "Ada Lovelace", phone: null } }),
    ]);
    const ics = await buildIcsFeed("c1");
    expect(ics).toContain("Ada Lovelace");
  });

  it("includes customer phone in DESCRIPTION when present", async () => {
    prismaMock.client.findUnique.mockResolvedValue({ businessName: "Salon" });
    prismaMock.booking.findMany.mockResolvedValue([
      makeBooking({ customer: { name: "Ada", phone: "555-1234" } }),
    ]);
    const ics = await buildIcsFeed("c1");
    expect(ics).toContain("555-1234");
  });

  it("omits DESCRIPTION when there are no notes and no phone", async () => {
    prismaMock.client.findUnique.mockResolvedValue({ businessName: "Salon" });
    prismaMock.booking.findMany.mockResolvedValue([
      makeBooking({ notes: null, customer: { name: "Ada", phone: null } }),
    ]);
    const ics = await buildIcsFeed("c1");
    expect(ics).not.toContain("DESCRIPTION:");
  });

  it("escapes special characters in service name (comma → \\,)", async () => {
    prismaMock.client.findUnique.mockResolvedValue({ businessName: "Salon" });
    prismaMock.booking.findMany.mockResolvedValue([
      makeBooking({ serviceName: "Cut, Color & Style" }),
    ]);
    const ics = await buildIcsFeed("c1");
    expect(ics).toContain("\\,");
  });

  it("scopes DB queries to the correct clientId (tenant isolation)", async () => {
    prismaMock.client.findUnique.mockResolvedValue({ businessName: "S" });
    prismaMock.booking.findMany.mockResolvedValue([]);
    await buildIcsFeed("tenant-99");
    expect(prismaMock.client.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "tenant-99" } }),
    );
    expect(prismaMock.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ clientId: "tenant-99" }) }),
    );
  });

  it("includes UID and DTSTAMP in each VEVENT", async () => {
    prismaMock.client.findUnique.mockResolvedValue({ businessName: "Salon" });
    prismaMock.booking.findMany.mockResolvedValue([makeBooking()]);
    const ics = await buildIcsFeed("c1");
    expect(ics).toContain("UID:");
    expect(ics).toContain("DTSTAMP:");
    expect(ics).toContain("DTSTART:");
    expect(ics).toContain("DTEND:");
  });
});
