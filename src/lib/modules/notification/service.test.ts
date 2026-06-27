import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

import {
  createNotification,
  createNotificationFromEmail,
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
} from "./service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createNotification", () => {
  it("persists a DASHBOARD notification using catalog meta defaults", async () => {
    prismaMock.notificationEvent.create.mockResolvedValue({ id: "n1" });

    await createNotification({ clientId: "c1", type: "lead.created" });

    expect(prismaMock.notificationEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: "c1",
          event: "lead.created",
          channel: "DASHBOARD",
        }),
      }),
    );
  });

  it("overrides catalog defaults with explicitly supplied fields", async () => {
    prismaMock.notificationEvent.create.mockResolvedValue({ id: "n1" });

    await createNotification({
      clientId: "c1",
      type: "lead.created",
      title: "Custom title",
      body: "Custom body",
      href: "/custom",
      icon: "Star",
      level: "success",
    });

    const payload = prismaMock.notificationEvent.create.mock.calls[0][0].data.payload as Record<string, unknown>;
    expect(payload.title).toBe("Custom title");
    expect(payload.body).toBe("Custom body");
    expect(payload.href).toBe("/custom");
    expect(payload.icon).toBe("Star");
    expect(payload.level).toBe("success");
  });

  it("sets recipientId when recipientUserId is provided", async () => {
    prismaMock.notificationEvent.create.mockResolvedValue({ id: "n1" });

    await createNotification({ clientId: "c1", type: "lead.created", recipientUserId: "u9" });

    expect(prismaMock.notificationEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ recipientId: "u9" }),
      }),
    );
  });

  it("is fail-soft: does not throw when the DB create rejects", async () => {
    prismaMock.notificationEvent.create.mockRejectedValue(new Error("DB down"));

    // Should resolve without throwing
    await expect(createNotification({ clientId: "c1", type: "lead.created" })).resolves.toBeUndefined();
  });

  it("uses DEFAULT_META for unknown types", async () => {
    prismaMock.notificationEvent.create.mockResolvedValue({ id: "n1" });

    await createNotification({ clientId: "c1", type: "totally.unknown" });

    const payload = prismaMock.notificationEvent.create.mock.calls[0][0].data.payload as Record<string, unknown>;
    expect(payload.icon).toBe("Bell");
    expect(payload.href).toBe("/client");
  });
});

describe("createNotificationFromEmail", () => {
  it("delegates to createNotification using the email template key and preheader as body", async () => {
    prismaMock.notificationEvent.create.mockResolvedValue({ id: "n1" });

    await createNotificationFromEmail("c1", "u1", {
      template: "preview_ready",
      preheader: "Your preview is here",
    } as never);

    expect(prismaMock.notificationEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event: "preview_ready",
          clientId: "c1",
          recipientId: "u1",
        }),
      }),
    );
    const payload = prismaMock.notificationEvent.create.mock.calls[0][0].data.payload as Record<string, unknown>;
    expect(payload.body).toBe("Your preview is here");
  });

  it("sets body to null when preheader is empty string", async () => {
    prismaMock.notificationEvent.create.mockResolvedValue({ id: "n1" });

    await createNotificationFromEmail("c1", null, {
      template: "preview_ready",
      preheader: "",
    } as never);

    const payload = prismaMock.notificationEvent.create.mock.calls[0][0].data.payload as Record<string, unknown>;
    expect(payload.body).toBeNull();
  });
});

describe("listNotifications", () => {
  it("returns notifications and unread count, scoped by clientId and DASHBOARD channel", async () => {
    const now = new Date();
    prismaMock.notificationEvent.findMany.mockResolvedValue([
      { id: "n1", event: "lead.created", payload: { title: "New inquiry", body: null, href: "/client/inquiries", icon: "Inbox", level: "info" }, readAt: null, createdAt: now },
    ]);
    prismaMock.notificationEvent.count.mockResolvedValue(1);

    const { notifications, unread } = await listNotifications("c1");

    expect(notifications).toHaveLength(1);
    expect(notifications[0].id).toBe("n1");
    expect(notifications[0].read).toBe(false);
    expect(unread).toBe(1);

    expect(prismaMock.notificationEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: "c1", channel: "DASHBOARD" } }),
    );
    expect(prismaMock.notificationEvent.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: "c1", channel: "DASHBOARD", readAt: null } }),
    );
  });

  it("clamps limit between 1 and 50", async () => {
    prismaMock.notificationEvent.findMany.mockResolvedValue([]);
    prismaMock.notificationEvent.count.mockResolvedValue(0);

    await listNotifications("c1", { limit: 999 });
    expect(prismaMock.notificationEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));

    await listNotifications("c1", { limit: 0 });
    expect(prismaMock.notificationEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 1 }));
  });

  it("maps a read notification (readAt set) to read:true", async () => {
    const now = new Date();
    prismaMock.notificationEvent.findMany.mockResolvedValue([
      { id: "n2", event: "lead.created", payload: {}, readAt: now, createdAt: now },
    ]);
    prismaMock.notificationEvent.count.mockResolvedValue(0);

    const { notifications } = await listNotifications("c1");
    expect(notifications[0].read).toBe(true);
  });
});

describe("unreadCount", () => {
  it("queries DASHBOARD unread count for the client", async () => {
    prismaMock.notificationEvent.count.mockResolvedValue(7);
    const count = await unreadCount("c1");
    expect(count).toBe(7);
    expect(prismaMock.notificationEvent.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: "c1", channel: "DASHBOARD", readAt: null } }),
    );
  });
});

describe("markRead", () => {
  it("is a no-op when ids is empty", async () => {
    await markRead("c1", []);
    expect(prismaMock.notificationEvent.updateMany).not.toHaveBeenCalled();
  });

  it("scopes the updateMany to clientId, DASHBOARD, and the provided ids", async () => {
    prismaMock.notificationEvent.updateMany.mockResolvedValue({ count: 1 });

    await markRead("c1", ["n1", "n2"]);

    expect(prismaMock.notificationEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ clientId: "c1", channel: "DASHBOARD", id: { in: ["n1", "n2"] }, readAt: null }),
        data: { readAt: expect.any(Date) },
      }),
    );
  });
});

describe("markAllRead", () => {
  it("marks all unread DASHBOARD notifications read for the client", async () => {
    prismaMock.notificationEvent.updateMany.mockResolvedValue({ count: 3 });

    await markAllRead("c1");

    expect(prismaMock.notificationEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clientId: "c1", channel: "DASHBOARD", readAt: null },
        data: { readAt: expect.any(Date) },
      }),
    );
  });
});
