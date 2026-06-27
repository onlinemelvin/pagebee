import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/email", () => ({ sendEmail: vi.fn(), escapeHtml: (s: string) => s }));

import { sweepFollowUpReminders } from "./reminders";
import { sendEmail } from "@/lib/modules/email";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sweepFollowUpReminders", () => {
  it("emails the assigned rep and marks the follow-up reminded once", async () => {
    const now = new Date("2026-06-27T12:00:00Z");
    prismaMock.followUp.findMany.mockResolvedValue([
      { id: "f1", assignedToId: "rep1", note: "Call back", prospect: { businessName: "Acme" } },
    ]);
    prismaMock.employee.findMany.mockResolvedValue([{ id: "rep1", user: { email: "rep@x.com" } }]);
    prismaMock.followUp.update.mockResolvedValue({});

    const res = await sweepFollowUpReminders(now);
    expect(res).toEqual({ processed: 1, emailed: 1 });
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "rep@x.com", subject: "Follow-up due: Acme" }));
    expect(prismaMock.followUp.update).toHaveBeenCalledWith({ where: { id: "f1" }, data: { remindedAt: now } });
  });

  it("still marks reminded (fire-once) when the rep has no email", async () => {
    prismaMock.followUp.findMany.mockResolvedValue([
      { id: "f1", assignedToId: "rep1", note: null, prospect: { businessName: "Acme" } },
    ]);
    prismaMock.employee.findMany.mockResolvedValue([{ id: "rep1", user: null }]);
    prismaMock.followUp.update.mockResolvedValue({});

    const res = await sweepFollowUpReminders(new Date());
    expect(res.emailed).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(prismaMock.followUp.update).toHaveBeenCalled();
  });

  it("no-ops when nothing is due", async () => {
    prismaMock.followUp.findMany.mockResolvedValue([]);
    const res = await sweepFollowUpReminders(new Date());
    expect(res).toEqual({ processed: 0, emailed: 0 });
  });
});
