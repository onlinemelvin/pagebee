import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./tenant-dispatch", () => ({
  dispatchToCustomer: vi.fn().mockResolvedValue({ logId: "l1", providerId: "p1", status: "SENT" }),
}));
vi.mock("./tenant-sender", () => ({
  resolveClientBrand: vi.fn().mockResolvedValue({
    clientId: "c1",
    businessName: "Acme Biz",
    slug: "acme",
    replyTo: "owner@acme.com",
    address: null,
    phone: null,
    logoUrl: null,
    primaryColor: "#f59e0b",
    websiteUrl: "https://acme.pagebee.com",
  }),
}));

import {
  sendInquiryAck,
  sendAppointmentConfirmation,
  sendInvoiceSent,
  sendReviewRequest,
  sendWinBack,
} from "./customer-notifications";
import { dispatchToCustomer } from "./tenant-dispatch";
import { resolveClientBrand } from "./tenant-sender";

const mockBrand = {
  clientId: "c1",
  businessName: "Acme Biz",
  slug: "acme",
  replyTo: "owner@acme.com",
  address: null,
  phone: null,
  logoUrl: null,
  primaryColor: "#f59e0b",
  websiteUrl: "https://acme.pagebee.com",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveClientBrand).mockResolvedValue(mockBrand);
  vi.mocked(dispatchToCustomer).mockResolvedValue({ logId: "l1", providerId: "p1", status: "SENT" });
});

describe("sendInquiryAck", () => {
  it("dispatches with CUSTOMER_INQUIRY category", async () => {
    await sendInquiryAck("c1", { to: "cust@x.com", customerId: "cust1", customerName: "Ada", message: "Hello" });
    expect(dispatchToCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ category: "CUSTOMER_INQUIRY", to: "cust@x.com" }),
    );
  });

  it("fails soft when to is null (no dispatch)", async () => {
    await sendInquiryAck("c1", { to: null });
    expect(dispatchToCustomer).not.toHaveBeenCalled();
  });

  it("fails soft when brand cannot be resolved (no dispatch)", async () => {
    vi.mocked(resolveClientBrand).mockResolvedValue(null);
    await sendInquiryAck("c1", { to: "cust@x.com" });
    expect(dispatchToCustomer).not.toHaveBeenCalled();
  });
});

describe("sendAppointmentConfirmation", () => {
  it("dispatches with CUSTOMER_APPOINTMENT category", async () => {
    await sendAppointmentConfirmation("c1", {
      to: "c@x.com", customerId: "cust1", customerName: "Bob",
      serviceName: "Plumbing", when: "2024-01-01 10:00",
    });
    expect(dispatchToCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ category: "CUSTOMER_APPOINTMENT" }),
    );
  });
});

describe("sendInvoiceSent", () => {
  it("dispatches with CUSTOMER_BILLING category and passes clientId", async () => {
    await sendInvoiceSent("c1", {
      to: "c@x.com", number: "INV-001", amountCents: 9900,
      dueOn: "2024-02-01", viewUrl: "https://x.com/inv/1",
    });
    expect(dispatchToCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "c1", category: "CUSTOMER_BILLING" }),
    );
  });

  it("fails soft when dispatchToCustomer throws", async () => {
    vi.mocked(dispatchToCustomer).mockRejectedValue(new Error("send failed"));
    // Should not throw to caller
    await expect(sendInvoiceSent("c1", {
      to: "c@x.com", number: "INV-1", amountCents: 100, viewUrl: "u",
    })).resolves.toBeUndefined();
  });
});

describe("sendReviewRequest", () => {
  it("dispatches with CUSTOMER_REVIEW category", async () => {
    await sendReviewRequest("c1", { to: "c@x.com", customerId: "cust1", reviewUrl: "https://g.co/review/biz" });
    expect(dispatchToCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ category: "CUSTOMER_REVIEW" }),
    );
  });
});

describe("sendWinBack", () => {
  it("dispatches with CUSTOMER_MARKETING category", async () => {
    await sendWinBack("c1", { to: "c@x.com", customerId: "cust1", ctaUrl: "https://acme.com/book" });
    expect(dispatchToCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ category: "CUSTOMER_MARKETING" }),
    );
  });
});
