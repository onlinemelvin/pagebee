import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("./dispatch", () => ({
  dispatch: vi.fn(),
}));
vi.mock("./layout", () => ({
  appBase: vi.fn().mockReturnValue("http://localhost:3000"),
  button: vi.fn().mockReturnValue("<a>btn</a>"),
  linkFallback: vi.fn().mockReturnValue("<p>link</p>"),
  panel: vi.fn().mockReturnValue("<div>panel</div>"),
  detailTable: vi.fn().mockReturnValue("<table>dt</table>"),
  usageBar: vi.fn().mockReturnValue("<div>bar</div>"),
  divider: vi.fn().mockReturnValue("<hr/>"),
}));
vi.mock("@/lib/modules/notification", () => ({
  createNotificationFromEmail: vi.fn(),
  isEmailAllowed: vi.fn(),
}));
// Also mock send for escapeHtml used by templates.ts
vi.mock("./send", () => ({
  sendEmail: vi.fn(),
  escapeHtml: (s: string) => s,
}));

import { sendWelcome, sendPaymentFailed, sendPasswordReset, sendRepInvite, clientRecipient } from "./notifications";
import { dispatch } from "./dispatch";
import { createNotificationFromEmail, isEmailAllowed } from "@/lib/modules/notification";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dispatch).mockResolvedValue({ logId: "l1", providerId: "p1", status: "SENT" });
  vi.mocked(createNotificationFromEmail).mockResolvedValue(undefined);
  vi.mocked(isEmailAllowed).mockResolvedValue(true);
});

describe("clientRecipient", () => {
  it("returns null when client is not found", async () => {
    prismaMock.client.findUnique.mockResolvedValue(null);
    const result = await clientRecipient("c1");
    expect(result).toBeNull();
  });

  it("returns null when no email is available", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      businessName: "Biz",
      ownerName: null,
      ownerEmail: null,
      users: [],
    } as never);
    const result = await clientRecipient("c1");
    expect(result).toBeNull();
  });

  it("uses ownerEmail when present", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      businessName: "Biz",
      ownerName: "Ada",
      ownerEmail: "ada@biz.com",
      users: [],
    } as never);
    const result = await clientRecipient("c1");
    expect(result?.to).toBe("ada@biz.com");
  });

  it("falls back to user email when ownerEmail is null", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      businessName: "Biz",
      ownerName: null,
      ownerEmail: null,
      users: [{ userId: "u1", user: { email: "owner@user.com" } }],
    } as never);
    const result = await clientRecipient("c1");
    expect(result?.to).toBe("owner@user.com");
  });
});

describe("sendWelcome (via toClient)", () => {
  it("always records in-app notification", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      businessName: "TestBiz",
      ownerName: "Ada",
      ownerEmail: "ada@biz.com",
      users: [],
    } as never);

    await sendWelcome("c1");

    expect(createNotificationFromEmail).toHaveBeenCalled();
  });

  it("sends email when opt-in allows it", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      businessName: "TestBiz",
      ownerName: "Ada",
      ownerEmail: "ada@biz.com",
      users: [],
    } as never);
    vi.mocked(isEmailAllowed).mockResolvedValue(true);

    await sendWelcome("c1");
    expect(dispatch).toHaveBeenCalled();
  });

  it("skips email send when opt-in denies it but still records in-app notification", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      businessName: "TestBiz",
      ownerName: "Ada",
      ownerEmail: "ada@biz.com",
      users: [],
    } as never);
    vi.mocked(isEmailAllowed).mockResolvedValue(false);

    await sendWelcome("c1");
    expect(createNotificationFromEmail).toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("fails soft when client has no recipient (no throw)", async () => {
    prismaMock.client.findUnique.mockResolvedValue(null);
    // Should not throw
    await expect(sendWelcome("c1")).resolves.toBeUndefined();
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("sendPaymentFailed (via toClient)", () => {
  it("dispatches email for billing failure", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      businessName: "TestBiz",
      ownerName: null,
      ownerEmail: "o@biz.com",
      users: [],
    } as never);
    vi.mocked(isEmailAllowed).mockResolvedValue(true);

    await sendPaymentFailed("c1", { amountCents: 9900, attempt: 2 });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ to: "o@biz.com", category: "BILLING" }),
    );
  });
});

describe("sendPasswordReset (via toEmail)", () => {
  it("dispatches directly to the given email address", async () => {
    await sendPasswordReset("user@example.com", { resetUrl: "https://x.com/reset", expiresMinutes: 30 });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ to: "user@example.com", category: "AUTH" }),
    );
  });

  it("fails soft when dispatch throws (no throw to caller)", async () => {
    vi.mocked(dispatch).mockRejectedValue(new Error("send failed"));
    await expect(sendPasswordReset("u@x.com", { resetUrl: "r", expiresMinutes: 10 })).resolves.toBeUndefined();
  });
});

describe("sendRepInvite (via toEmail)", () => {
  it("dispatches an ACCOUNT invite to the rep's address", async () => {
    await sendRepInvite("rep@example.com", { name: "Jane", setPasswordUrl: "https://x.com/set", portalUrl: "https://x.com/rep", expiresDays: 7 });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ to: "rep@example.com", category: "ACCOUNT", template: "rep_invite" }),
    );
  });
});
