import { describe, it, expect } from "vitest";

import { NOTIF_META, DEFAULT_META, metaForType, groupForCategory, NOTIFICATION_GROUPS } from "./meta";

describe("metaForType", () => {
  it("returns the catalog entry for a known type", () => {
    const meta = metaForType("lead.created");
    expect(meta.group).toBe("inquiries");
    expect(meta.icon).toBe("Inbox");
    expect(meta.level).toBe("info");
  });

  it("returns DEFAULT_META for an unknown type", () => {
    const meta = metaForType("totally.unknown.event.xyz");
    expect(meta).toBe(DEFAULT_META);
    expect(meta.group).toBeNull();
  });

  it("DEFAULT_META has group null (always-send)", () => {
    expect(DEFAULT_META.group).toBeNull();
  });
});

describe("NOTIF_META catalog invariants", () => {
  it("every entry has a non-empty icon, href, and title", () => {
    for (const [type, meta] of Object.entries(NOTIF_META)) {
      expect(meta.icon, `${type}.icon`).toBeTruthy();
      expect(meta.href, `${type}.href`).toBeTruthy();
      expect(meta.title, `${type}.title`).toBeTruthy();
    }
  });

  it("every entry group is null or a member of NOTIFICATION_GROUPS", () => {
    for (const [type, meta] of Object.entries(NOTIF_META)) {
      if (meta.group !== null) {
        expect(NOTIFICATION_GROUPS, `${type}.group`).toContain(meta.group);
      }
    }
  });

  it("critical types (payment.disputed, payment_failed, subscription_cancelled) have group null", () => {
    expect(NOTIF_META["payment.disputed"].group).toBeNull();
    expect(NOTIF_META["payment_failed"].group).toBeNull();
    expect(NOTIF_META["subscription_cancelled"].group).toBeNull();
  });

  it("welcome has group null (onboarding — always send)", () => {
    expect(NOTIF_META["welcome"].group).toBeNull();
  });

  it("lead.created belongs to inquiries group", () => {
    expect(NOTIF_META["lead.created"].group).toBe("inquiries");
  });

  it("booking.created belongs to appointments group", () => {
    expect(NOTIF_META["booking.created"].group).toBe("appointments");
  });
});

describe("groupForCategory", () => {
  it("maps BILLING → billing", () => {
    expect(groupForCategory("BILLING")).toBe("billing");
  });

  it("maps WEBSITE → website", () => {
    expect(groupForCategory("WEBSITE")).toBe("website");
  });

  it("maps USAGE → website", () => {
    expect(groupForCategory("USAGE")).toBe("website");
  });

  it("maps AUTH → null (always send)", () => {
    expect(groupForCategory("AUTH")).toBeNull();
  });

  it("maps ACCOUNT → null (always send)", () => {
    expect(groupForCategory("ACCOUNT")).toBeNull();
  });

  it("maps WELCOME → null (always send)", () => {
    expect(groupForCategory("WELCOME")).toBeNull();
  });
});
