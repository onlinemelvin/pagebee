import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("./send", () => ({
  sendEmail: vi.fn().mockResolvedValue({ id: "resend-id", stubbed: false }),
  escapeHtml: (s: string) => s,
}));
vi.mock("./tenant-layout", () => ({
  renderTenantLayout: vi.fn().mockReturnValue("<html>tenant layout</html>"),
}));
vi.mock("./tenant-sender", () => ({
  resolveClientBrand: vi.fn(),
  resolveClientSender: vi.fn(),
}));
vi.mock("./customer-consent", () => ({
  customerEmailConsent: vi.fn().mockResolvedValue("unknown"),
  customerUnsubPageUrl: vi.fn().mockReturnValue("https://x.com/unsub/tok"),
  customerUnsubOneClickUrl: vi.fn().mockReturnValue("https://x.com/api/customer-unsub?token=tok"),
}));

import { dispatchToCustomer } from "./tenant-dispatch";
import { sendEmail } from "./send";
import { resolveClientBrand, resolveClientSender } from "./tenant-sender";
import { customerEmailConsent } from "./customer-consent";

const mockBrand = {
  clientId: "c1",
  businessName: "Acme Plumbing",
  slug: "acme",
  replyTo: "owner@acme.com",
  address: null,
  phone: null,
  logoUrl: null,
  primaryColor: "#f59e0b",
  websiteUrl: "https://acme.pagebee.com",
};

const mockSender = {
  from: "Acme <hello@mail.pagebee.com>",
  replyTo: "owner@acme.com",
  sendingDomain: "mail.pagebee.com",
  usingCustomDomain: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveClientBrand).mockResolvedValue(mockBrand);
  vi.mocked(resolveClientSender).mockResolvedValue(mockSender);
  vi.mocked(sendEmail).mockResolvedValue({ id: "resend-id", stubbed: false });
  vi.mocked(customerEmailConsent).mockResolvedValue("unknown");
  prismaMock.emailLog.create.mockResolvedValue({ id: "log1" } as never);
  prismaMock.emailLog.update.mockResolvedValue({} as never);
});

describe("dispatchToCustomer", () => {
  const baseParams = {
    clientId: "c1",
    to: "customer@example.com",
    subject: "Your appointment",
    body: "<p>body</p>",
    category: "CUSTOMER_APPOINTMENT" as never,
    template: "appointment_confirmation",
    brand: mockBrand,
  };

  it("returns SKIPPED when to is empty string", async () => {
    const result = await dispatchToCustomer({ ...baseParams, to: "" });
    expect(result.status).toBe("SKIPPED");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns SKIPPED when brand cannot be resolved", async () => {
    vi.mocked(resolveClientBrand).mockResolvedValue(null);
    const result = await dispatchToCustomer({ ...baseParams, brand: undefined });
    expect(result.status).toBe("SKIPPED");
  });

  it("sends transactional email without consent check", async () => {
    vi.mocked(sendEmail).mockResolvedValue({ id: "rid", stubbed: false });
    const result = await dispatchToCustomer(baseParams);
    expect(customerEmailConsent).not.toHaveBeenCalled();
    expect(result.status).toBe("SENT");
  });

  it("suppresses CUSTOMER_MARKETING when consent is not granted", async () => {
    vi.mocked(customerEmailConsent).mockResolvedValue("unknown");
    const result = await dispatchToCustomer({
      ...baseParams,
      category: "CUSTOMER_MARKETING" as never,
      customerId: "cust-1",
    });
    expect(result.status).toBe("SUPPRESSED");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends CUSTOMER_MARKETING when consent is granted", async () => {
    vi.mocked(customerEmailConsent).mockResolvedValue("granted");
    vi.mocked(sendEmail).mockResolvedValue({ id: "rid", stubbed: false });
    const result = await dispatchToCustomer({
      ...baseParams,
      category: "CUSTOMER_MARKETING" as never,
      customerId: "cust-1",
    });
    expect(result.status).toBe("SENT");
  });

  it("suppresses CUSTOMER_REVIEW when consent is explicitly revoked", async () => {
    vi.mocked(customerEmailConsent).mockResolvedValue("revoked");
    const result = await dispatchToCustomer({
      ...baseParams,
      category: "CUSTOMER_REVIEW" as never,
      customerId: "cust-1",
    });
    expect(result.status).toBe("SUPPRESSED");
  });

  it("sends CUSTOMER_REVIEW when consent is not revoked (unknown is ok)", async () => {
    vi.mocked(customerEmailConsent).mockResolvedValue("unknown");
    vi.mocked(sendEmail).mockResolvedValue({ id: "rid", stubbed: false });
    const result = await dispatchToCustomer({
      ...baseParams,
      category: "CUSTOMER_REVIEW" as never,
      customerId: "cust-1",
    });
    expect(result.status).toBe("SENT");
  });

  it("skips marketing without a customerId (cannot verify consent)", async () => {
    const result = await dispatchToCustomer({
      ...baseParams,
      category: "CUSTOMER_MARKETING" as never,
      customerId: null,
    });
    expect(result.status).toBe("SKIPPED");
  });

  it("returns STUBBED when sendEmail returns stubbed=true", async () => {
    vi.mocked(sendEmail).mockResolvedValue({ id: null, stubbed: true });
    const result = await dispatchToCustomer(baseParams);
    expect(result.status).toBe("STUBBED");
  });

  it("returns FAILED and logs error when sendEmail throws", async () => {
    vi.mocked(sendEmail).mockRejectedValue(new Error("provider error"));
    const result = await dispatchToCustomer(baseParams);
    expect(result.status).toBe("FAILED");
    expect(prismaMock.emailLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED", error: "provider error" }) }),
    );
  });

  it("logs with audience=CUSTOMER", async () => {
    vi.mocked(sendEmail).mockResolvedValue({ id: "rid", stubbed: false });
    await dispatchToCustomer(baseParams);
    expect(prismaMock.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ audience: "CUSTOMER" }) }),
    );
  });
});
