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

import {
  sendWelcome,
  sendPaymentFailed,
  sendPasswordReset,
  sendRepInvite,
  clientRecipient,
  dashboardUrl,
  billingUrl,
  websiteUrl,
  supportUrl,
  upgradeUrl,
  reviewUrl,
  sendPaymentReceipt,
  sendRenewalNotice,
  sendSubscriptionCancelled,
  sendPlanChanged,
  sendPreviewReady,
  sendSitePublished,
  sendUpdateApproved,
  sendUpdateRejected,
  sendQuotaWarning,
  sendSetupFeePending,
  sendPreviewAutoReleaseReminder,
  sendEmailVerify,
  sendPasswordChanged,
  sendEmailChanged,
  sendNewDeviceLogin,
  sendRepContractSigned,
  sendPreviewToProspect,
  sendAdminHelpRequest,
} from "./notifications";
import { dispatch } from "./dispatch";
import { appBase } from "./layout";
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

describe("URL builders", () => {
  // resetAllMocks (global setup) wipes the layout factory's appBase return; re-apply it.
  beforeEach(() => vi.mocked(appBase).mockReturnValue("http://localhost:3000"));

  it("derive client URLs from the app base", () => {
    expect(dashboardUrl()).toBe("http://localhost:3000/client");
    expect(billingUrl()).toBe("http://localhost:3000/client/billing");
    expect(websiteUrl()).toBe("http://localhost:3000/client/website");
    expect(supportUrl()).toContain("support=1");
    expect(upgradeUrl()).toContain("upgrade=1");
    expect(reviewUrl()).toBe("http://localhost:3000/client/website");
  });
});

// The remaining client-addressed senders are thin toClient() wrappers; with a
// resolvable recipient they each dispatch their template's email.
describe("remaining toClient senders", () => {
  beforeEach(() => {
    prismaMock.client.findUnique.mockResolvedValue({
      businessName: "Biz",
      ownerName: "Ada",
      ownerEmail: "ada@biz.com",
      users: [],
    } as never);
  });

  it("sendPaymentReceipt → payment_receipt", async () => {
    await sendPaymentReceipt("c1", { amountCents: 4900, description: "Honey", when: "Today", invoiceUrl: "https://x/i" });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ template: "payment_receipt" }));
  });

  it("sendRenewalNotice → renewal_notice", async () => {
    await sendRenewalNotice("c1", { amountCents: 4900, renewsOn: "Jul 1" });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ template: "renewal_notice" }));
  });

  it("sendSubscriptionCancelled → subscription_cancelled (default args)", async () => {
    await sendSubscriptionCancelled("c1");
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ template: "subscription_cancelled" }));
  });

  it("sendPlanChanged → plan_changed", async () => {
    await sendPlanChanged("c1", { fromPlan: "Honey", toPlan: "Hive" });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ template: "plan_changed" }));
  });

  it("sendPreviewReady → preview_ready", async () => {
    await sendPreviewReady("c1");
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ template: "preview_ready" }));
  });

  it("sendSitePublished → site_published", async () => {
    await sendSitePublished("c1", "https://acme.com");
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ template: "site_published" }));
  });

  it("sendUpdateApproved → update_approved", async () => {
    await sendUpdateApproved("c1", "https://acme.com");
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ template: "update_approved" }));
  });

  it("sendUpdateRejected → update_rejected (with reason)", async () => {
    await sendUpdateRejected("c1", "needs logo");
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ template: "update_rejected" }));
  });

  it("sendQuotaWarning → quota_warning", async () => {
    await sendQuotaWarning("c1", { metric: "leads", used: 90, limit: 100 });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ template: "quota_warning" }));
  });

  it("sendSetupFeePending → setup_fee_pending", async () => {
    await sendSetupFeePending("c1");
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ template: "setup_fee_pending" }));
  });

  it("sendPreviewAutoReleaseReminder → preview_auto_release_reminder", async () => {
    await sendPreviewAutoReleaseReminder("c1", 12);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ template: "preview_auto_release_reminder" }));
  });
});

describe("remaining toEmail senders", () => {
  it("sendEmailVerify → email_verify", async () => {
    await sendEmailVerify("u@x.com", { verifyUrl: "https://x/v" });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ template: "email_verify", to: "u@x.com" }));
  });

  it("sendPasswordChanged → password_changed", async () => {
    await sendPasswordChanged("u@x.com", { name: "Sam" });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ template: "password_changed" }));
  });

  it("sendEmailChanged → email_changed", async () => {
    await sendEmailChanged("u@x.com", { newEmail: "new@x.com" });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ template: "email_changed" }));
  });

  it("sendNewDeviceLogin → new_device_login", async () => {
    await sendNewDeviceLogin("u@x.com", { when: "Today", context: "Chrome" });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ template: "new_device_login" }));
  });

  it("sendRepContractSigned attaches the signed PDF", async () => {
    const pdf = { filename: "agreement.pdf", content: Buffer.from("x"), contentType: "application/pdf" };
    await sendRepContractSigned("rep@x.com", { portalUrl: "https://x/p", pdf: pdf as never });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ template: "rep_contract_signed", attachments: [pdf] }),
    );
  });

  it("sendPreviewToProspect → rep_preview_to_prospect", async () => {
    await sendPreviewToProspect("lead@x.com", { businessName: "Acme", previewUrl: "https://x/p/1" });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ template: "rep_preview_to_prospect" }));
  });

  it("sendAdminHelpRequest routes to the ADMIN_EMAIL inbox address", async () => {
    process.env.ADMIN_EMAIL = "admin@pagebee.com";
    await sendAdminHelpRequest({ repName: "Sam", message: "help", inboxUrl: "https://x/inbox" });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ template: "admin_help_request", to: "admin@pagebee.com" }),
    );
    delete process.env.ADMIN_EMAIL;
  });
});
