import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("./bulk", () => ({
  sendCampaign: vi.fn().mockResolvedValue({ sent: 1, suppressed: 0, failed: 0 }),
}));
vi.mock("./notifications", () => ({
  sendSetupFeePending: vi.fn().mockResolvedValue(undefined),
}));

import { sweepScheduledCampaigns, sweepEmailReminders } from "./sweep";
import { sendCampaign } from "./bulk";
import * as notify from "./notifications";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sweepScheduledCampaigns", () => {
  it("sends all due campaigns and returns count", async () => {
    prismaMock.emailCampaign.findMany.mockResolvedValue([
      { id: "camp1" }, { id: "camp2" },
    ] as never);

    const result = await sweepScheduledCampaigns();
    expect(sendCampaign).toHaveBeenCalledTimes(2);
    expect(result.sent).toBe(2);
  });

  it("returns 0 when no campaigns are due", async () => {
    prismaMock.emailCampaign.findMany.mockResolvedValue([]);
    const result = await sweepScheduledCampaigns();
    expect(result.sent).toBe(0);
  });

  it("continues processing remaining campaigns when one throws", async () => {
    prismaMock.emailCampaign.findMany.mockResolvedValue([
      { id: "camp1" }, { id: "camp2" },
    ] as never);
    vi.mocked(sendCampaign)
      .mockRejectedValueOnce(new Error("provider error"))
      .mockResolvedValueOnce({ sent: 1, suppressed: 0, failed: 0 });

    const result = await sweepScheduledCampaigns();
    // camp1 failed, camp2 succeeded
    expect(result.sent).toBe(1);
  });
});

describe("sweepEmailReminders", () => {
  it("sends setup fee reminder for eligible subscriptions", async () => {
    prismaMock.subscription.findMany.mockResolvedValue([
      {
        clientId: "c1",
        client: { isTest: false, previews: [{ id: "p1" }] },
      },
    ] as never);
    // No recent send
    prismaMock.emailLog.findFirst.mockResolvedValue(null);

    const result = await sweepEmailReminders();
    expect(notify.sendSetupFeePending).toHaveBeenCalledWith("c1");
    expect(result.setupReminders).toBe(1);
  });

  it("skips test accounts", async () => {
    prismaMock.subscription.findMany.mockResolvedValue([
      { clientId: "c1", client: { isTest: true, previews: [{ id: "p1" }] } },
    ] as never);

    const result = await sweepEmailReminders();
    expect(notify.sendSetupFeePending).not.toHaveBeenCalled();
    expect(result.setupReminders).toBe(0);
  });

  it("skips clients with no preview", async () => {
    prismaMock.subscription.findMany.mockResolvedValue([
      { clientId: "c1", client: { isTest: false, previews: [] } },
    ] as never);

    const result = await sweepEmailReminders();
    expect(notify.sendSetupFeePending).not.toHaveBeenCalled();
    expect(result.setupReminders).toBe(0);
  });

  it("skips clients that were recently sent a reminder (dedup)", async () => {
    prismaMock.subscription.findMany.mockResolvedValue([
      { clientId: "c1", client: { isTest: false, previews: [{ id: "p1" }] } },
    ] as never);
    // Recent email log exists
    prismaMock.emailLog.findFirst.mockResolvedValue({ id: "recent-log" } as never);

    const result = await sweepEmailReminders();
    expect(notify.sendSetupFeePending).not.toHaveBeenCalled();
    expect(result.setupReminders).toBe(0);
  });
});
