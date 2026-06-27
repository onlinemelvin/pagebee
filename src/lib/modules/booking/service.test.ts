import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/events", () => ({ emit: vi.fn() }));
vi.mock("@/lib/modules/email/customer-notifications", () => ({
  sendAppointmentConfirmation: vi.fn(),
  sendAppointmentCancelled: vi.fn(),
  sendAppointmentReminder: vi.fn(),
  sendAppointmentRescheduled: vi.fn(),
}));
vi.mock("@/lib/modules/service", () => ({
  getServiceDurations: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock("@/lib/site/booking", () => ({
  defaultBookingHtml: vi.fn(() => "<section>book</section>"),
}));

import {
  bookingEnabled,
  hasSchedulingSettings,
  getBookingMeta,
  createBooking,
  listBookings,
  getCustomerHistory,
  updateBookingStatus,
  deleteBooking,
  getSchedulingSettings,
  saveSchedulingSettings,
  getAvailability,
  rescheduleBooking,
  getBookingHistory,
  createManualBooking,
  sweepBookingReminders,
  BookingError,
} from "./service";
import { writeAudit } from "@/lib/modules/audit";
import { emit } from "@/lib/events";
import * as customerNotify from "@/lib/modules/email/customer-notifications";
import { getServiceDurations } from "@/lib/modules/service";

beforeEach(() => {
  vi.clearAllMocks();
  // vi.resetAllMocks() in setup.ts clears implementations — restore them here.
  vi.mocked(getServiceDurations).mockResolvedValue(new Map());
});

// ── helpers ───────────────────────────────────────────────────────────────────

const START = new Date("2026-07-10T13:00:00Z");
const END = new Date("2026-07-10T14:00:00Z");

function clientWithBooking() {
  return {
    id: "c1",
    subscription: { plan: { featureFlags: { booking: true } } },
  };
}

function settingsRow() {
  return {
    calendarSettings: {
      timezone: "America/New_York",
      weekly: {},
      blockedDates: [],
      concurrent: 1,
      slotMinutes: 60,
      bufferMinutes: 0,
      minNoticeHours: 0,
      maxAdvanceDays: 30,
      dailyCap: 0,
    },
  };
}

function makeBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: "bk1",
    clientId: "c1",
    customerId: "cust1",
    status: "CONFIRMED",
    serviceName: "Haircut",
    startAt: START,
    endAt: END,
    notes: null,
    confirmationSentAt: null,
    reminderSentAt: null,
    customer: { id: "cust1", name: "Ada", email: "ada@x.com", phone: null },
    client: { businessName: "Salon", ownerEmail: "owner@salon.com" },
    ...overrides,
  };
}

// ── bookingEnabled / hasSchedulingSettings ────────────────────────────────────

describe("hasSchedulingSettings", () => {
  it("returns true when calendarSettings is set", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue(settingsRow() as never);
    expect(await hasSchedulingSettings("c1")).toBe(true);
  });

  it("returns false when calendarSettings is null", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue({ calendarSettings: null } as never);
    expect(await hasSchedulingSettings("c1")).toBe(false);
  });

  it("returns false when clientSetting row doesn't exist", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue(null);
    expect(await hasSchedulingSettings("c1")).toBe(false);
  });
});

describe("bookingEnabled", () => {
  it("returns false when the plan lacks the booking flag", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      subscription: { plan: { featureFlags: {} } },
    } as never);
    expect(await bookingEnabled("c1")).toBe(false);
  });

  it("returns false when the plan has booking but owner has not opted in", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      subscription: { plan: { featureFlags: { booking: true } } },
    } as never);
    prismaMock.featureFlag.findUnique.mockResolvedValue({ enabled: false });
    expect(await bookingEnabled("c1")).toBe(false);
  });

  it("returns false when opted in but calendarSettings is missing", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      subscription: { plan: { featureFlags: { booking: true } } },
    } as never);
    prismaMock.featureFlag.findUnique.mockResolvedValue({ enabled: true });
    prismaMock.clientSetting.findUnique.mockResolvedValue({ calendarSettings: null } as never);
    expect(await bookingEnabled("c1")).toBe(false);
  });

  it("returns true when opted-in and calendarSettings is present", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      subscription: { plan: { featureFlags: { booking: true } } },
    } as never);
    prismaMock.featureFlag.findUnique.mockResolvedValue({ enabled: true });
    prismaMock.clientSetting.findUnique.mockResolvedValue(settingsRow() as never);
    expect(await bookingEnabled("c1")).toBe(true);
  });

  it("short-circuits to true for showcase planOverride", async () => {
    // Plan has booking; showcase=true should skip further checks
    const result = await bookingEnabled("c1", { flags: { booking: true }, showcase: true });
    expect(result).toBe(true);
    // Should not touch the DB for feature flag overrides or calendarSettings
    expect(prismaMock.featureFlag.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.clientSetting.findUnique).not.toHaveBeenCalled();
  });

  it("returns false when showcase plan does not include booking", async () => {
    const result = await bookingEnabled("c1", { flags: {}, showcase: true });
    expect(result).toBe(false);
  });
});

describe("getBookingMeta", () => {
  it("returns null when disabled and no stored html", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      subscription: { plan: { featureFlags: {} } },
    } as never);
    expect(await getBookingMeta("c1", null)).toBeNull();
  });

  it("returns enabled:false with stored html even when feature is off", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      subscription: { plan: { featureFlags: {} } },
    } as never);
    const result = await getBookingMeta("c1", "<section>book</section>");
    expect(result).not.toBeNull();
    expect(result!.enabled).toBe(false);
  });

  it("returns enabled:true and the stored html when booking is live", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      subscription: { plan: { featureFlags: { booking: true } } },
    } as never);
    prismaMock.featureFlag.findUnique.mockResolvedValue({ enabled: true });
    prismaMock.clientSetting.findUnique.mockResolvedValue(settingsRow() as never);
    const result = await getBookingMeta("c1", "<section>custom</section>");
    expect(result!.enabled).toBe(true);
    expect(result!.html).toBe("<section>custom</section>");
  });
});

// ── createBooking ─────────────────────────────────────────────────────────────

describe("createBooking", () => {
  function setupEnabled() {
    prismaMock.client.findUnique.mockResolvedValue(clientWithBooking() as never);
    prismaMock.clientSetting.findUnique.mockResolvedValue(settingsRow() as never);
    prismaMock.booking.count.mockResolvedValue(0); // slot free
  }

  it("throws client_not_found when the client doesn't exist", async () => {
    prismaMock.client.findUnique.mockResolvedValue(null);
    await expect(
      createBooking({ clientId: "c1", input: { serviceName: "Cut", startAt: START.toISOString(), name: "Ada" } as never }),
    ).rejects.toThrow("client_not_found");
  });

  it("throws feature_not_enabled when the plan lacks booking", async () => {
    prismaMock.client.findUnique.mockResolvedValue({ id: "c1", subscription: { plan: { featureFlags: {} } } } as never);
    await expect(
      createBooking({ clientId: "c1", input: { serviceName: "Cut", startAt: START.toISOString(), name: "Ada" } as never }),
    ).rejects.toThrow("feature_not_enabled");
  });

  it("creates a new customer when no match found", async () => {
    setupEnabled();
    prismaMock.customer.findFirst.mockResolvedValue(null);
    prismaMock.customer.create.mockResolvedValue({ id: "cust-new" } as never);
    prismaMock.booking.create.mockResolvedValue({ id: "bk1", clientId: "c1" } as never);

    await createBooking({
      clientId: "c1",
      input: { serviceName: "Cut", startAt: START.toISOString(), name: "Ada", email: "ada@x.com" } as never,
    });
    expect(prismaMock.customer.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ clientId: "c1", name: "Ada" }) }),
    );
  });

  it("reuses an existing customer matched by email", async () => {
    setupEnabled();
    prismaMock.customer.findFirst.mockResolvedValue({ id: "cust-existing" } as never);
    prismaMock.booking.create.mockResolvedValue({ id: "bk1", clientId: "c1" } as never);

    await createBooking({
      clientId: "c1",
      input: { serviceName: "Cut", startAt: START.toISOString(), name: "Ada", email: "ada@x.com" } as never,
    });
    expect(prismaMock.customer.create).not.toHaveBeenCalled();
  });

  it("audits and emits booking.created on success", async () => {
    setupEnabled();
    prismaMock.customer.findFirst.mockResolvedValue(null);
    prismaMock.customer.create.mockResolvedValue({ id: "cust1" } as never);
    const booking = { id: "bk1", clientId: "c1" };
    prismaMock.booking.create.mockResolvedValue(booking as never);

    await createBooking({
      clientId: "c1",
      input: { serviceName: "Cut", startAt: START.toISOString(), name: "Ada" } as never,
    });
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "booking.created", clientId: "c1", entityId: "bk1" }));
    expect(emit).toHaveBeenCalledWith("booking.created", expect.objectContaining({ booking }));
  });

  it("throws slot_unavailable when slot is full", async () => {
    prismaMock.client.findUnique.mockResolvedValue(clientWithBooking() as never);
    prismaMock.clientSetting.findUnique.mockResolvedValue(settingsRow() as never);
    prismaMock.customer.findFirst.mockResolvedValue(null);
    prismaMock.customer.create.mockResolvedValue({ id: "cust1" } as never);
    prismaMock.booking.count.mockResolvedValue(1); // slot taken

    await expect(
      createBooking({ clientId: "c1", input: { serviceName: "Cut", startAt: START.toISOString(), name: "Ada" } as never }),
    ).rejects.toThrow("slot_unavailable");
  });

  it("infers endAt as startAt + 1h when not supplied", async () => {
    setupEnabled();
    prismaMock.customer.findFirst.mockResolvedValue(null);
    prismaMock.customer.create.mockResolvedValue({ id: "cust1" } as never);
    prismaMock.booking.create.mockResolvedValue({ id: "bk1" } as never);

    await createBooking({
      clientId: "c1",
      input: { serviceName: "Cut", startAt: START.toISOString(), name: "Ada" } as never,
    });
    expect(prismaMock.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          startAt: START,
          endAt: new Date(START.getTime() + 3_600_000),
        }),
      }),
    );
  });
});

// ── listBookings ──────────────────────────────────────────────────────────────

describe("listBookings", () => {
  it("scopes to clientId", async () => {
    prismaMock.booking.findMany.mockResolvedValue([]);
    await listBookings("c1");
    expect(prismaMock.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ clientId: "c1" }) }),
    );
  });

  it("adds date range filter when from/to are provided", async () => {
    prismaMock.booking.findMany.mockResolvedValue([]);
    await listBookings("c1", { from: START, to: END });
    expect(prismaMock.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          startAt: expect.objectContaining({ gte: START, lte: END }),
        }),
      }),
    );
  });
});

// ── getCustomerHistory ────────────────────────────────────────────────────────

describe("getCustomerHistory", () => {
  it("scopes to both clientId and customerId", async () => {
    prismaMock.booking.findMany.mockResolvedValue([]);
    await getCustomerHistory("c1", "cust1");
    expect(prismaMock.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: "c1", customerId: "cust1" } }),
    );
  });
});

// ── updateBookingStatus ───────────────────────────────────────────────────────

describe("updateBookingStatus", () => {
  it("throws not_found when booking not owned by tenant", async () => {
    prismaMock.booking.findFirst.mockResolvedValue(null);
    await expect(updateBookingStatus("c1", "bk1", "CONFIRMED")).rejects.toThrow("not_found");
    expect(prismaMock.booking.update).not.toHaveBeenCalled();
  });

  it("updates status and audits on CONFIRMED", async () => {
    prismaMock.booking.findFirst.mockResolvedValue(makeBooking() as never);
    prismaMock.booking.update.mockResolvedValue(makeBooking({ status: "CONFIRMED" }) as never);
    prismaMock.clientSetting.findUnique.mockResolvedValue(settingsRow() as never);

    await updateBookingStatus("c1", "bk1", "CONFIRMED");
    expect(prismaMock.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CONFIRMED" }) }),
    );
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "booking.confirmed" }));
  });

  it("sends confirmation email to customer on CONFIRMED", async () => {
    prismaMock.booking.findFirst.mockResolvedValue(makeBooking() as never);
    prismaMock.booking.update.mockResolvedValue(makeBooking({ status: "CONFIRMED" }) as never);
    prismaMock.clientSetting.findUnique.mockResolvedValue(settingsRow() as never);

    await updateBookingStatus("c1", "bk1", "CONFIRMED");
    expect(customerNotify.sendAppointmentConfirmation).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ to: "ada@x.com" }),
    );
  });

  it("sends cancellation email on CANCELLED", async () => {
    prismaMock.booking.findFirst.mockResolvedValue(makeBooking() as never);
    prismaMock.booking.update.mockResolvedValue(makeBooking({ status: "CANCELLED" }) as never);
    prismaMock.clientSetting.findUnique.mockResolvedValue(settingsRow() as never);

    await updateBookingStatus("c1", "bk1", "CANCELLED");
    expect(customerNotify.sendAppointmentCancelled).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ to: "ada@x.com" }),
    );
  });

  it("does not send email when customer has no email", async () => {
    const booking = makeBooking({ customer: { id: "cust1", name: "Ada", email: null, phone: null } });
    prismaMock.booking.findFirst.mockResolvedValue(booking as never);
    prismaMock.booking.update.mockResolvedValue(booking as never);

    await updateBookingStatus("c1", "bk1", "CONFIRMED");
    expect(customerNotify.sendAppointmentConfirmation).not.toHaveBeenCalled();
  });

  it("does not send email for COMPLETED status", async () => {
    prismaMock.booking.findFirst.mockResolvedValue(makeBooking() as never);
    prismaMock.booking.update.mockResolvedValue(makeBooking({ status: "COMPLETED" }) as never);

    await updateBookingStatus("c1", "bk1", "COMPLETED");
    expect(customerNotify.sendAppointmentConfirmation).not.toHaveBeenCalled();
    expect(customerNotify.sendAppointmentCancelled).not.toHaveBeenCalled();
  });
});

// ── deleteBooking ─────────────────────────────────────────────────────────────

describe("deleteBooking", () => {
  it("throws not_found for wrong tenant (IDOR guard)", async () => {
    prismaMock.booking.findFirst.mockResolvedValue(null);
    await expect(deleteBooking("c1", "bk1")).rejects.toThrow("not_found");
    expect(prismaMock.booking.delete).not.toHaveBeenCalled();
  });

  it("deletes and audits when owned", async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: "bk1" } as never);
    prismaMock.booking.delete.mockResolvedValue({ id: "bk1" } as never);

    const result = await deleteBooking("c1", "bk1");
    expect(result).toEqual({ id: "bk1" });
    expect(prismaMock.booking.delete).toHaveBeenCalledWith({ where: { id: "bk1" } });
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "booking.deleted" }));
  });
});

// ── getSchedulingSettings / saveSchedulingSettings ────────────────────────────

describe("getSchedulingSettings", () => {
  it("returns defaults when no clientSetting row exists", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue(null);
    const settings = await getSchedulingSettings("c1");
    expect(settings.timezone).toBe("America/New_York");
    expect(settings.slotMinutes).toBe(60);
  });

  it("returns stored settings when present", async () => {
    prismaMock.clientSetting.findUnique.mockResolvedValue({
      calendarSettings: { ...settingsRow().calendarSettings, slotMinutes: 30 },
    } as never);
    const settings = await getSchedulingSettings("c1");
    expect(settings.slotMinutes).toBe(30);
  });
});

describe("saveSchedulingSettings", () => {
  it("upserts calendarSettings and audits", async () => {
    prismaMock.clientSetting.upsert.mockResolvedValue({} as never);
    const input = { timezone: "America/Chicago" };
    const result = await saveSchedulingSettings("c1", input);
    expect(prismaMock.clientSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: "c1" } }),
    );
    expect(result.timezone).toBe("America/Chicago");
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "booking.settings_updated", clientId: "c1" }),
    );
  });

  it("throws ZodError for invalid input", async () => {
    await expect(saveSchedulingSettings("c1", { slotMinutes: "not-a-number" })).rejects.toThrow();
  });
});

// ── getAvailability ───────────────────────────────────────────────────────────

describe("getAvailability", () => {
  it("throws feature_not_enabled when booking not on plan", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      id: "c1",
      subscription: { plan: { featureFlags: {} } },
    } as never);
    await expect(getAvailability("c1")).rejects.toThrow("feature_not_enabled");
  });

  it("returns a flat list of slots when enabled", async () => {
    prismaMock.client.findUnique.mockResolvedValue(clientWithBooking() as never);
    // Settings with minNoticeHours=0 so slots are returned immediately
    prismaMock.clientSetting.findUnique.mockResolvedValue({
      calendarSettings: { ...settingsRow().calendarSettings, minNoticeHours: 0 },
    } as never);
    prismaMock.booking.findMany.mockResolvedValue([]);
    const slots = await getAvailability("c1");
    expect(Array.isArray(slots)).toBe(true);
  });
});

// ── rescheduleBooking ─────────────────────────────────────────────────────────

describe("rescheduleBooking", () => {
  const NEW_START = new Date("2026-07-15T13:00:00Z");

  function setup() {
    prismaMock.booking.findFirst.mockResolvedValue(makeBooking() as never);
    prismaMock.clientSetting.findUnique.mockResolvedValue(settingsRow() as never);
    prismaMock.booking.count.mockResolvedValue(0); // slot free
    prismaMock.booking.update.mockResolvedValue(makeBooking({ startAt: NEW_START }) as never);
  }

  it("throws not_found for wrong tenant", async () => {
    prismaMock.booking.findFirst.mockResolvedValue(null);
    await expect(rescheduleBooking("c1", "bk1", NEW_START.toISOString())).rejects.toThrow("not_found");
  });

  it("updates to RESCHEDULED status", async () => {
    setup();
    await rescheduleBooking("c1", "bk1", NEW_START.toISOString());
    expect(prismaMock.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "RESCHEDULED" }) }),
    );
  });

  it("audits the reschedule with from/to timestamps", async () => {
    setup();
    await rescheduleBooking("c1", "bk1", NEW_START.toISOString(), undefined, "Owner conflict");
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "booking.rescheduled",
        metadata: expect.objectContaining({ toStartAt: NEW_START.toISOString(), reason: "Owner conflict" }),
      }),
    );
  });

  it("throws slot_unavailable when the new slot is full", async () => {
    prismaMock.booking.findFirst.mockResolvedValue(makeBooking() as never);
    prismaMock.clientSetting.findUnique.mockResolvedValue(settingsRow() as never);
    prismaMock.booking.count.mockResolvedValue(1); // slot taken
    await expect(rescheduleBooking("c1", "bk1", NEW_START.toISOString())).rejects.toThrow("slot_unavailable");
  });

  it("sends rescheduled notification to customer", async () => {
    setup();
    await rescheduleBooking("c1", "bk1", NEW_START.toISOString());
    expect(customerNotify.sendAppointmentRescheduled).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ to: "ada@x.com" }),
    );
  });
});

// ── getBookingHistory ─────────────────────────────────────────────────────────

describe("getBookingHistory", () => {
  it("throws not_found when booking not owned by tenant", async () => {
    prismaMock.booking.findFirst.mockResolvedValue(null);
    await expect(getBookingHistory("c1", "bk1")).rejects.toThrow("not_found");
  });

  it("returns mapped audit log entries", async () => {
    prismaMock.booking.findFirst.mockResolvedValue({ id: "bk1" } as never);
    prismaMock.auditLog.findMany.mockResolvedValue([
      {
        action: "booking.rescheduled",
        metadata: { fromStartAt: START.toISOString(), toStartAt: END.toISOString(), reason: "test" },
        createdAt: new Date("2026-07-10T00:00:00Z"),
      },
    ]);
    const history = await getBookingHistory("c1", "bk1");
    expect(history).toHaveLength(1);
    expect(history[0].action).toBe("booking.rescheduled");
    expect(history[0].reason).toBe("test");
  });
});

// ── createManualBooking ───────────────────────────────────────────────────────

describe("createManualBooking", () => {
  function setup() {
    prismaMock.client.findUnique.mockResolvedValue(clientWithBooking() as never);
    prismaMock.clientSetting.findUnique.mockResolvedValue(settingsRow() as never);
    prismaMock.booking.count.mockResolvedValue(0);
  }

  it("creates booking with CONFIRMED status", async () => {
    setup();
    prismaMock.customer.findFirst.mockResolvedValue(null);
    prismaMock.customer.create.mockResolvedValue({ id: "cust1" } as never);
    prismaMock.booking.create.mockResolvedValue({ id: "bk1" } as never);

    await createManualBooking("c1", {
      serviceName: "Haircut",
      startAt: START.toISOString(),
      name: "Ada",
    } as never);
    expect(prismaMock.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CONFIRMED" }) }),
    );
    expect(writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "booking.created_manual" }),
    );
  });
});

// ── sweepBookingReminders ─────────────────────────────────────────────────────

describe("sweepBookingReminders", () => {
  it("returns { sent: 0 } when no bookings are due", async () => {
    prismaMock.booking.findMany.mockResolvedValue([]);
    const result = await sweepBookingReminders();
    expect(result).toEqual({ sent: 0 });
  });

  it("sends reminders and stamps reminderSentAt", async () => {
    const booking = makeBooking({
      status: "CONFIRMED",
      reminderSentAt: null,
      clientId: "c1",
      customerId: "cust1",
    });
    prismaMock.booking.findMany.mockResolvedValue([booking as never]);
    prismaMock.clientSetting.findUnique.mockResolvedValue(settingsRow() as never);
    prismaMock.booking.update.mockResolvedValue({} as never);

    const result = await sweepBookingReminders({ hoursAhead: 24 });
    expect(customerNotify.sendAppointmentReminder).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ to: "ada@x.com" }),
    );
    expect(prismaMock.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "bk1" }, data: expect.objectContaining({ reminderSentAt: expect.any(Date) }) }),
    );
    expect(result.sent).toBe(1);
  });

  it("skips booking with no customer email", async () => {
    const booking = makeBooking({
      status: "CONFIRMED",
      customer: { id: "cust1", name: "Ada", email: null, phone: null },
    });
    prismaMock.booking.findMany.mockResolvedValue([booking as never]);
    const result = await sweepBookingReminders();
    expect(customerNotify.sendAppointmentReminder).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
  });
});
