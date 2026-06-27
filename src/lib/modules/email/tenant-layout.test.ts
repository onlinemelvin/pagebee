import { describe, it, expect } from "vitest";
import { renderTenantLayout, tButton, tPanel } from "./tenant-layout";
import type { ClientBrand } from "./tenant-sender";

const baseBrand: ClientBrand = {
  clientId: "c1",
  businessName: "Acme Plumbing",
  slug: "acme-plumbing",
  replyTo: "owner@acmeplumbing.com",
  address: "123 Main St, Springfield",
  phone: "555-1234",
  logoUrl: null,
  primaryColor: "#3b82f6",
  websiteUrl: "https://acmeplumbing.com",
};

describe("renderTenantLayout", () => {
  it("includes the business name in the output", () => {
    const html = renderTenantLayout({ brand: baseBrand, body: "<p>Hello</p>" });
    expect(html).toContain("Acme Plumbing");
  });

  it("includes the body content", () => {
    const html = renderTenantLayout({ brand: baseBrand, body: "<p>Special offer</p>" });
    expect(html).toContain("<p>Special offer</p>");
  });

  it("uses the brand's primary color for the accent bar", () => {
    const html = renderTenantLayout({ brand: baseBrand, body: "" });
    expect(html).toContain("#3b82f6");
  });

  it("renders the logo image when logoUrl is a valid https URL", () => {
    const brand = { ...baseBrand, logoUrl: "https://cdn.example.com/logo.png" };
    const html = renderTenantLayout({ brand, body: "" });
    expect(html).toContain("https://cdn.example.com/logo.png");
    expect(html).toContain("<img ");
  });

  it("renders the business name as text when logoUrl is null", () => {
    const html = renderTenantLayout({ brand: { ...baseBrand, logoUrl: null }, body: "" });
    // Should contain business name as text (not as img alt only)
    expect(html).toContain("Acme Plumbing");
  });

  it("blocks javascript: logoUrl (returns # for unsafe URLs)", () => {
    const brand = { ...baseBrand, logoUrl: "javascript:alert(1)" };
    const html = renderTenantLayout({ brand, body: "" });
    expect(html).not.toContain("javascript:");
  });

  it("includes unsubscribe link in marketing footer when unsubscribeUrl is provided", () => {
    const html = renderTenantLayout({ brand: baseBrand, body: "", unsubscribeUrl: "https://pagebee.com/unsub/tok" });
    expect(html).toContain("Unsubscribe");
    expect(html).toContain("https://pagebee.com/unsub/tok");
  });

  it("includes the physical address in marketing footer", () => {
    const html = renderTenantLayout({ brand: baseBrand, body: "", unsubscribeUrl: "https://x.com/u" });
    expect(html).toContain("123 Main St, Springfield");
  });

  it("omits unsubscribe footer when no unsubscribeUrl", () => {
    const html = renderTenantLayout({ brand: baseBrand, body: "" });
    expect(html).not.toContain("Unsubscribe");
  });

  it("includes the website URL in the footer", () => {
    const html = renderTenantLayout({ brand: baseBrand, body: "" });
    expect(html).toContain("acmeplumbing.com");
  });

  it("includes phone number in footer contact", () => {
    const html = renderTenantLayout({ brand: baseBrand, body: "" });
    expect(html).toContain("555-1234");
  });

  it("escapes the preheader text", () => {
    const html = renderTenantLayout({ brand: baseBrand, body: "", preheader: "Hello <World> & more" });
    expect(html).toContain("Hello &lt;World&gt; &amp; more");
  });

  it("is a valid HTML document starting with doctype", () => {
    const html = renderTenantLayout({ brand: baseBrand, body: "" });
    expect(html).toMatch(/^<!doctype html>/i);
  });
});

describe("tButton", () => {
  it("renders a link with the label, url, and color", () => {
    const result = tButton("Book Now", "https://example.com/book", "#3b82f6");
    expect(result).toContain("Book Now");
    expect(result).toContain("https://example.com/book");
    expect(result).toContain("#3b82f6");
  });

  it("escapes the label", () => {
    const result = tButton("<script>xss</script>", "https://safe.com", "#000");
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
  });

  it("uses # for javascript: URLs", () => {
    const result = tButton("Click", "javascript:alert(1)", "#000");
    expect(result).not.toContain("javascript:");
    expect(result).toContain('href="#"');
  });
});

describe("tPanel", () => {
  it("wraps body content in a styled table", () => {
    const result = tPanel("<p>Panel content</p>");
    expect(result).toContain("<p>Panel content</p>");
    expect(result).toContain("border-radius");
  });
});
