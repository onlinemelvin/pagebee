import { describe, it, expect, vi } from "vitest";

vi.mock("./service", () => ({
  sendSms: vi.fn(),
}));
vi.mock("./sms-prefs", () => ({
  isSmsGroupAllowed: vi.fn(),
  getSmsPrefs: vi.fn(),
}));

import { notifyOwnerSms } from "./owner-alerts";
import { sendSms } from "./service";
import { isSmsGroupAllowed, getSmsPrefs } from "./sms-prefs";

describe("notifyOwnerSms", () => {
  it("does nothing when the group is not allowed (fail-soft)", async () => {
    vi.mocked(isSmsGroupAllowed).mockResolvedValue(false);

    await notifyOwnerSms("c1", "inquiries", "You have a new inquiry!");

    expect(sendSms).not.toHaveBeenCalled();
  });

  it("does nothing when the owner has no phone number", async () => {
    vi.mocked(isSmsGroupAllowed).mockResolvedValue(true);
    vi.mocked(getSmsPrefs).mockResolvedValue({ enabled: true, phone: null, inquiries: true, appointments: true });

    await notifyOwnerSms("c1", "inquiries", "You have a new inquiry!");

    expect(sendSms).not.toHaveBeenCalled();
  });

  it("sends with consentVerified=true when allowed and phone is present", async () => {
    vi.mocked(isSmsGroupAllowed).mockResolvedValue(true);
    vi.mocked(getSmsPrefs).mockResolvedValue({ enabled: true, phone: "+15551234567", inquiries: true, appointments: true });
    vi.mocked(sendSms).mockResolvedValue({ status: "sent", to: "+15551234567" });

    await notifyOwnerSms("c1", "inquiries", "A visitor needs you!");

    expect(sendSms).toHaveBeenCalledWith("c1", "+15551234567", "A visitor needs you!", { consentVerified: true });
  });

  it("does not throw when sendSms rejects (fail-soft for owner alerts)", async () => {
    vi.mocked(isSmsGroupAllowed).mockResolvedValue(true);
    vi.mocked(getSmsPrefs).mockResolvedValue({ enabled: true, phone: "+15551234567", inquiries: true, appointments: true });
    vi.mocked(sendSms).mockRejectedValue(new Error("Twilio down"));

    // Should resolve without throwing
    await expect(notifyOwnerSms("c1", "inquiries", "Test")).resolves.toBeUndefined();
  });

  it("does not throw when isSmsGroupAllowed rejects (fail-soft)", async () => {
    vi.mocked(isSmsGroupAllowed).mockRejectedValue(new Error("db down"));

    await expect(notifyOwnerSms("c1", "inquiries", "Test")).resolves.toBeUndefined();
    expect(sendSms).not.toHaveBeenCalled();
  });
});
