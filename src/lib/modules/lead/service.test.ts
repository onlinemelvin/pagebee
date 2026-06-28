import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

// External side-effects are mocked: we assert the service's own behaviour
// (persistence shape, tenant scoping, audit + event emission), not theirs.
vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/events", () => ({ emit: vi.fn() }));
vi.mock("@/lib/modules/email", () => ({ sendEmail: vi.fn(), escapeHtml: (s: string) => s }));

import { createLead, listLeads, updateLead, replyToLead, leadCaptureEnabled } from "./service";
import { writeAudit } from "@/lib/modules/audit";
import { emit } from "@/lib/events";
import { sendEmail } from "@/lib/modules/email";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createLead", () => {
  it("persists with the clientId from context (never the body), audits, and emits lead.created", async () => {
    const lead = { id: "l1", clientId: "c1" };
    prismaMock.lead.create.mockResolvedValue(lead);

    const result = await createLead({
      clientId: "c1",
      input: { type: "CONTACT", name: "Ada", email: "ada@x.com", phone: null, message: "hi", source: "site" } as never,
      ip: "1.2.3.4",
    });

    expect(result).toBe(lead);
    expect(prismaMock.lead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ clientId: "c1", name: "Ada", email: "ada@x.com" }),
    });
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "lead.created", clientId: "c1", entityId: "l1" }));
    expect(emit).toHaveBeenCalledWith("lead.created", { lead });
  });

  it("collapses a rapid duplicate (same clientId+email+name) without re-creating, auditing, or emitting", async () => {
    const existing = { id: "l0", status: "NEW", createdAt: new Date() };
    prismaMock.lead.findFirst.mockResolvedValue(existing);

    const result = await createLead({
      clientId: "c1",
      input: { type: "CONTACT_FORM", name: "Ada", email: "ada@x.com", phone: "1", source: "site" } as never,
    });

    expect(result).toBe(existing);
    expect(prismaMock.lead.create).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});

describe("leadCaptureEnabled", () => {
  it("is false when the plan lacks contactForm", async () => {
    prismaMock.featureFlag.findUnique.mockResolvedValue(null);
    prismaMock.client.findUnique.mockResolvedValue({ subscription: { plan: { featureFlags: {} } } });
    expect(await leadCaptureEnabled("c1")).toBe(false);
  });

  it("is true on-plan by default (no override row)", async () => {
    prismaMock.featureFlag.findUnique.mockResolvedValue(null);
    prismaMock.client.findUnique.mockResolvedValue({ subscription: { plan: { featureFlags: { contactForm: true } } } });
    expect(await leadCaptureEnabled("c1")).toBe(true);
  });

  it("respects an explicit owner opt-out", async () => {
    prismaMock.featureFlag.findUnique.mockResolvedValue({ enabled: false });
    prismaMock.client.findUnique.mockResolvedValue({ subscription: { plan: { featureFlags: { contactForm: true } } } });
    expect(await leadCaptureEnabled("c1")).toBe(false);
  });

  it("showcases a higher-tier preview regardless of the owner toggle", async () => {
    prismaMock.featureFlag.findUnique.mockResolvedValue({ enabled: false });
    expect(await leadCaptureEnabled("c1", { flags: { contactForm: true }, showcase: true })).toBe(true);
  });
});

describe("listLeads", () => {
  it("scopes by clientId and status when provided", async () => {
    prismaMock.lead.findMany.mockResolvedValue([]);
    await listLeads({ clientId: "c1", status: "NEW" as never });
    expect(prismaMock.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: "c1", status: "NEW" } }),
    );
  });
});

describe("updateLead", () => {
  it("fails closed when the lead is not owned by the scoping tenant (IDOR backstop)", async () => {
    prismaMock.lead.findFirst.mockResolvedValue(null);
    await expect(updateLead("l1", { status: "CONTACTED" } as never, undefined, "other-tenant")).rejects.toThrow("lead_not_found");
    expect(prismaMock.lead.update).not.toHaveBeenCalled();
  });

  it("updates and audits when ownership checks pass", async () => {
    prismaMock.lead.findFirst.mockResolvedValue({ id: "l1" });
    prismaMock.lead.update.mockResolvedValue({ id: "l1", clientId: "c1" });
    await updateLead("l1", { status: "CONTACTED" } as never, { userId: "u1" }, "c1");
    expect(prismaMock.lead.update).toHaveBeenCalled();
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "lead.updated" }));
  });
});

describe("replyToLead", () => {
  it("rejects when the lead is not found for the tenant", async () => {
    prismaMock.lead.findFirst.mockResolvedValue(null);
    await expect(replyToLead("c1", "l1", "hello")).rejects.toThrow("lead_not_found");
  });

  it("rejects when the lead has no email", async () => {
    prismaMock.lead.findFirst.mockResolvedValue({ id: "l1", email: null });
    await expect(replyToLead("c1", "l1", "hello")).rejects.toThrow("lead_no_email");
  });

  it("emails the lead, advances NEW→CONTACTED, and audits", async () => {
    prismaMock.lead.findFirst.mockResolvedValue({ id: "l1", email: "ada@x.com", status: "NEW" });
    prismaMock.client.findUnique.mockResolvedValue({ businessName: "Acme", ownerEmail: "o@acme.com" });
    const res = await replyToLead("c1", "l1", "thanks");
    expect(res).toEqual({ ok: true });
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "ada@x.com", replyTo: "o@acme.com" }));
    expect(prismaMock.lead.update).toHaveBeenCalledWith({ where: { id: "l1" }, data: { status: "CONTACTED" } });
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "lead.replied" }));
  });

  it("does not re-advance status when the lead is already past NEW", async () => {
    prismaMock.lead.findFirst.mockResolvedValue({ id: "l1", email: "ada@x.com", status: "CONTACTED" });
    prismaMock.client.findUnique.mockResolvedValue({ businessName: "Acme", ownerEmail: null });
    await replyToLead("c1", "l1", "thanks");
    expect(prismaMock.lead.update).not.toHaveBeenCalled();
  });
});
