import { describe, it, expect } from "vitest";
import {
  welcomeEmail,
  repInviteEmail,
  adminHelpRequestEmail,
  repPreviewToProspectEmail,
  repContractSignedEmail,
  passwordResetEmail,
  emailVerifyEmail,
  passwordChangedEmail,
  emailChangedEmail,
  newDeviceLoginEmail,
  paymentReceiptEmail,
  paymentFailedEmail,
  renewalNoticeEmail,
  subscriptionCancelledEmail,
  planChangedEmail,
  previewReadyEmail,
  sitePublishedEmail,
  updateApprovedEmail,
  updateRejectedEmail,
  quotaWarningEmail,
  setupFeePendingEmail,
  previewAutoReleaseReminderEmail,
} from "./templates";

// Every builder returns a BuiltEmail; assert the shared shape so a builder that
// forgets a field (or returns the wrong category/template key) is caught.
function expectWellFormed(email: {
  subject: string;
  preheader: string;
  body: string;
  category: string;
  template: string;
}) {
  expect(email.subject.length).toBeGreaterThan(0);
  expect(email.preheader.length).toBeGreaterThan(0);
  expect(email.body.length).toBeGreaterThan(0);
  expect(email.category.length).toBeGreaterThan(0);
  expect(email.template.length).toBeGreaterThan(0);
}

describe("welcomeEmail", () => {
  it("personalises the subject with the owner's first name", () => {
    const email = welcomeEmail({ businessName: "Acme", ownerName: "Jane Doe", dashboardUrl: "https://x/dash" });
    expectWellFormed(email);
    expect(email.subject).toContain("Jane");
    expect(email.category).toBe("WELCOME");
    expect(email.template).toBe("welcome");
    expect(email.body).toContain("Acme");
    expect(email.body).toContain("https://x/dash");
  });

  it("omits the name when none is given", () => {
    const email = welcomeEmail({ businessName: "Acme", dashboardUrl: "https://x/dash" });
    expect(email.subject).toBe("Welcome to PageBee 🐝");
  });
});

describe("repInviteEmail", () => {
  it("includes the set-password link and expiry", () => {
    const email = repInviteEmail({ name: "Sam", setPasswordUrl: "https://x/set", portalUrl: "https://x/portal", expiresDays: 7 });
    expectWellFormed(email);
    expect(email.category).toBe("ACCOUNT");
    expect(email.body).toContain("https://x/set");
    expect(email.body).toContain("7 days");
    expect(email.body).toContain("Sam");
  });
});

describe("adminHelpRequestEmail", () => {
  it("includes the rep email and preview link when present", () => {
    const email = adminHelpRequestEmail({
      repName: "Sam",
      repEmail: "sam@x.com",
      message: "Help please",
      previewUrl: "https://x/p/abc",
      inboxUrl: "https://x/inbox",
    });
    expectWellFormed(email);
    expect(email.subject).toContain("Sam");
    expect(email.body).toContain("sam@x.com");
    expect(email.body).toContain("https://x/p/abc");
  });

  it("omits the email and preview link when absent", () => {
    const email = adminHelpRequestEmail({ repName: "Sam", message: "Help", inboxUrl: "https://x/inbox" });
    expect(email.body).not.toContain("sam@");
    expect(email.body).not.toContain("Preview:");
  });
});

describe("repPreviewToProspectEmail", () => {
  it("greets the contact by name when known", () => {
    const email = repPreviewToProspectEmail({ businessName: "Acme", contactName: "Jo Bloggs", previewUrl: "https://x/p/1" });
    expectWellFormed(email);
    expect(email.category).toBe("WEBSITE");
    expect(email.body).toContain("Jo");
    expect(email.body).toContain("https://x/p/1");
  });

  it("falls back to a generic heading without a name", () => {
    const email = repPreviewToProspectEmail({ businessName: "Acme", previewUrl: "https://x/p/1" });
    expect(email.body).toContain("your website preview");
  });
});

describe("repContractSignedEmail", () => {
  it("links to the portal copy", () => {
    const email = repContractSignedEmail({ name: "Sam", portalUrl: "https://x/portal" });
    expectWellFormed(email);
    expect(email.template).toBe("rep_contract_signed");
    expect(email.body).toContain("https://x/portal");
  });
});

describe("auth/security templates", () => {
  it("passwordResetEmail includes the reset url and expiry", () => {
    const email = passwordResetEmail({ name: "Sam", resetUrl: "https://x/reset", expiresMinutes: 30 });
    expectWellFormed(email);
    expect(email.category).toBe("AUTH");
    expect(email.body).toContain("https://x/reset");
    expect(email.body).toContain("30 minutes");
  });

  it("emailVerifyEmail includes the verify url", () => {
    const email = emailVerifyEmail({ name: "Sam", verifyUrl: "https://x/verify" });
    expectWellFormed(email);
    expect(email.body).toContain("https://x/verify");
  });

  it("passwordChangedEmail includes a support link", () => {
    const email = passwordChangedEmail({ name: "Sam", supportUrl: "https://x/support" });
    expectWellFormed(email);
    expect(email.body).toContain("https://x/support");
  });

  it("emailChangedEmail shows the new email", () => {
    const email = emailChangedEmail({ name: "Sam", newEmail: "new@x.com", supportUrl: "https://x/support" });
    expectWellFormed(email);
    expect(email.body).toContain("new@x.com");
  });

  it("newDeviceLoginEmail shows when and device context", () => {
    const email = newDeviceLoginEmail({ name: "Sam", when: "Today 10am", context: "Chrome on Mac", supportUrl: "https://x/s" });
    expectWellFormed(email);
    expect(email.body).toContain("Today 10am");
    expect(email.body).toContain("Chrome on Mac");
  });
});

describe("billing templates", () => {
  it("paymentReceiptEmail renders amount and optional invoice button", () => {
    const email = paymentReceiptEmail({
      businessName: "Acme",
      ownerName: "Jane",
      amountCents: 4900,
      description: "Honey plan",
      when: "Today",
      invoiceUrl: "https://x/inv",
    });
    expectWellFormed(email);
    expect(email.category).toBe("BILLING");
    expect(email.body).toContain("$49.00");
    expect(email.body).toContain("https://x/inv");
  });

  it("paymentReceiptEmail omits the button without an invoice url", () => {
    const email = paymentReceiptEmail({ businessName: "Acme", amountCents: 100, description: "x", when: "Today" });
    expect(email.body).not.toContain("View receipt");
  });

  it("paymentFailedEmail names the attempt and update url", () => {
    const email = paymentFailedEmail({ businessName: "Acme", amountCents: 4900, attempt: 2, updatePaymentUrl: "https://x/upd" });
    expectWellFormed(email);
    expect(email.body).toContain("attempt 2");
    expect(email.body).toContain("https://x/upd");
  });

  it("renewalNoticeEmail shows renewal date and amount", () => {
    const email = renewalNoticeEmail({ businessName: "Acme", amountCents: 4900, renewsOn: "Jul 1", manageUrl: "https://x/m" });
    expectWellFormed(email);
    expect(email.subject).toContain("Jul 1");
    expect(email.body).toContain("$49.00");
  });

  it("subscriptionCancelledEmail mentions access window when given", () => {
    const withAccess = subscriptionCancelledEmail({ businessName: "Acme", accessUntil: "Aug 1", reactivateUrl: "https://x/r" });
    expect(withAccess.body).toContain("Aug 1");
    const without = subscriptionCancelledEmail({ businessName: "Acme", reactivateUrl: "https://x/r" });
    expect(without.body).not.toContain("keep full access until");
  });

  it("planChangedEmail shows the from/to plans", () => {
    const email = planChangedEmail({ businessName: "Acme", fromPlan: "Honey", toPlan: "Hive", dashboardUrl: "https://x/d" });
    expectWellFormed(email);
    expect(email.subject).toContain("Hive");
    expect(email.body).toContain("Honey");
  });
});

describe("website lifecycle templates", () => {
  it("previewReadyEmail links to the review url", () => {
    const email = previewReadyEmail({ businessName: "Acme", reviewUrl: "https://x/rev" });
    expectWellFormed(email);
    expect(email.body).toContain("https://x/rev");
  });

  it("sitePublishedEmail strips the scheme from the displayed url", () => {
    const email = sitePublishedEmail({ businessName: "Acme", siteUrl: "https://acme.com" });
    expectWellFormed(email);
    expect(email.body).toContain("acme.com");
    expect(email.body).toContain("https://acme.com");
  });

  it("updateApprovedEmail links to the live site", () => {
    const email = updateApprovedEmail({ businessName: "Acme", siteUrl: "https://acme.com" });
    expectWellFormed(email);
    expect(email.body).toContain("https://acme.com");
  });

  it("updateRejectedEmail includes the reason panel when given", () => {
    const withReason = updateRejectedEmail({ businessName: "Acme", reason: "Need a logo", dashboardUrl: "https://x/d" });
    expect(withReason.body).toContain("Need a logo");
    const without = updateRejectedEmail({ businessName: "Acme", dashboardUrl: "https://x/d" });
    expect(without.body).not.toContain("Here's why");
  });
});

describe("usage/reminder templates", () => {
  it("quotaWarningEmail computes the usage percentage", () => {
    const email = quotaWarningEmail({ businessName: "Acme", metric: "leads", used: 90, limit: 100, upgradeUrl: "https://x/u" });
    expectWellFormed(email);
    expect(email.subject).toContain("90%");
    expect(email.body).toContain("90 of 100");
  });

  it("quotaWarningEmail avoids divide-by-zero on a zero limit", () => {
    const email = quotaWarningEmail({ businessName: "Acme", metric: "leads", used: 0, limit: 0, upgradeUrl: "https://x/u" });
    expect(email.subject).toContain("0%");
  });

  it("setupFeePendingEmail links to the pay url", () => {
    const email = setupFeePendingEmail({ businessName: "Acme", payUrl: "https://x/pay" });
    expectWellFormed(email);
    expect(email.body).toContain("https://x/pay");
  });

  it("previewAutoReleaseReminderEmail states the hours left", () => {
    const email = previewAutoReleaseReminderEmail({ businessName: "Acme", reviewUrl: "https://x/r", hoursLeft: 12 });
    expectWellFormed(email);
    expect(email.body).toContain("12 hours");
  });
});
