import { describe, it, expect, vi } from "vitest";
import { prismaMock } from "@/test/setup";

import { writeAudit } from "./index";

describe("writeAudit", () => {
  it("creates an audit log row with all provided fields", async () => {
    prismaMock.auditLog.create.mockResolvedValue({ id: "a1" } as never);

    await writeAudit({
      action: "lead.created",
      entityType: "Lead",
      entityId: "l1",
      actorId: "u1",
      clientId: "c1",
      metadata: { foo: "bar" },
      ip: "1.2.3.4",
    });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: {
        action: "lead.created",
        entityType: "Lead",
        entityId: "l1",
        actorId: "u1",
        clientId: "c1",
        metadata: { foo: "bar" },
        ipAddress: "1.2.3.4",
      },
    });
  });

  it("coerces undefined optional fields to null", async () => {
    prismaMock.auditLog.create.mockResolvedValue({ id: "a2" } as never);

    await writeAudit({ action: "test.action", entityType: "Client" });

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityId: null,
        actorId: null,
        clientId: null,
        ipAddress: null,
      }),
    });
  });

  it("is fail-soft — does not throw when the DB write fails", async () => {
    prismaMock.auditLog.create.mockRejectedValue(new Error("DB down"));

    await expect(
      writeAudit({ action: "test.action", entityType: "Client", clientId: "c1" }),
    ).resolves.toBeUndefined();
  });

  it("does not throw when auditLog.create rejects (error is swallowed)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.auditLog.create.mockRejectedValue(new Error("constraint violation"));

    await writeAudit({ action: "any.action", entityType: "Foo" });

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
