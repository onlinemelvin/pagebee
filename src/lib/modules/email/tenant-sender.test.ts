import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/finance", () => ({
  getFinanceSettings: vi.fn().mockRejectedValue(new Error("no settings")),
}));
vi.mock("@/lib/modules/website/domain", () => ({
  getDomainState: vi.fn().mockResolvedValue(null),
}));

import { resolveClientBrand, resolveClientSender, sharedMailDomain } from "./tenant-sender";
import type { ClientBrand } from "./tenant-sender";
import { getFinanceSettings } from "@/lib/modules/finance";
import { getDomainState } from "@/lib/modules/website/domain";

beforeEach(() => {
  vi.clearAllMocks();
  // Restore default implementations after vi.resetAllMocks() clears them
  vi.mocked(getFinanceSettings).mockRejectedValue(new Error("no settings"));
  vi.mocked(getDomainState).mockResolvedValue(null);
});

const baseBrand: ClientBrand = {
  clientId: "c1",
  businessName: "Acme Plumbing",
  slug: "acme-plumbing",
  replyTo: "owner@acmeplumbing.com",
  address: null,
  phone: null,
  logoUrl: null,
  primaryColor: "#f59e0b",
  websiteUrl: "https://acme-plumbing.pagebee.com",
};

describe("sharedMailDomain", () => {
  it("returns CUSTOMER_MAIL_DOMAIN when set", () => {
    process.env.CUSTOMER_MAIL_DOMAIN = "mail.custom.com";
    expect(sharedMailDomain()).toBe("mail.custom.com");
    delete process.env.CUSTOMER_MAIL_DOMAIN;
  });

  it("falls back to mail.<root> for non-localhost roots", () => {
    delete process.env.CUSTOMER_MAIL_DOMAIN;
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = "pagebee.com";
    expect(sharedMailDomain()).toBe("mail.pagebee.com");
    delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  });
});

describe("resolveClientBrand", () => {
  it("returns null when client does not exist", async () => {
    prismaMock.client.findUnique.mockResolvedValue(null);
    const result = await resolveClientBrand("c1");
    expect(result).toBeNull();
  });

  it("returns brand with fallback amber when no branding settings exist", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      businessName: "Test Biz",
      slug: "test-biz",
      ownerEmail: "owner@test.com",
      settings: null,
    } as never);

    const result = await resolveClientBrand("c1");
    expect(result).not.toBeNull();
    expect(result!.primaryColor).toBe("#f59e0b");
    expect(result!.businessName).toBe("Test Biz");
  });

  it("uses finance businessInfo name over client.businessName when available", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      businessName: "Old Name",
      slug: "old-slug",
      ownerEmail: "o@x.com",
      settings: null,
    } as never);
    vi.mocked(getFinanceSettings).mockResolvedValue({
      businessInfo: { name: "Finance Name", email: "fi@x.com", address: "123 St", phone: "555", currency: "USD" },
    } as never);

    const result = await resolveClientBrand("c1");
    expect(result!.businessName).toBe("Finance Name");
  });

  it("uses branding settings primaryColor when set", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      businessName: "Biz",
      slug: "biz",
      ownerEmail: "o@biz.com",
      settings: { branding: { primaryColor: "#ff0000" } },
    } as never);

    const result = await resolveClientBrand("c1");
    expect(result!.primaryColor).toBe("#ff0000");
  });
});

describe("resolveClientSender", () => {
  it("uses the shared domain when no verified sending domain exists", async () => {
    prismaMock.sendingDomain.findFirst.mockResolvedValue(null);
    delete process.env.CUSTOMER_MAIL_DOMAIN;
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = "pagebee.com";

    const result = await resolveClientSender(baseBrand);
    expect(result.sendingDomain).toBe("mail.pagebee.com");
    expect(result.usingCustomDomain).toBe(false);
    expect(result.from).toContain("mail.pagebee.com");
    expect(result.from).toContain("Acme Plumbing");

    delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  });

  it("uses the client's verified domain when one exists", async () => {
    prismaMock.sendingDomain.findFirst.mockResolvedValue({ domain: "acmeplumbing.com" } as never);

    const result = await resolveClientSender(baseBrand);
    expect(result.sendingDomain).toBe("acmeplumbing.com");
    expect(result.usingCustomDomain).toBe(true);
    expect(result.from).toContain("acmeplumbing.com");
  });

  it("includes replyTo from brand", async () => {
    prismaMock.sendingDomain.findFirst.mockResolvedValue(null);

    const result = await resolveClientSender(baseBrand);
    expect(result.replyTo).toBe("owner@acmeplumbing.com");
  });

  it("quotes a business name with commas in the From header", async () => {
    prismaMock.sendingDomain.findFirst.mockResolvedValue(null);
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = "pagebee.com";

    const brand = { ...baseBrand, businessName: "Smith, Jones & Partners" };
    const result = await resolveClientSender(brand);
    expect(result.from).toMatch(/^"Smith, Jones/);

    delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  });
});
