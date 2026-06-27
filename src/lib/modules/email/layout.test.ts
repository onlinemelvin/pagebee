import { describe, it, expect } from "vitest";
import { renderLayout, button, linkFallback, panel, divider, detailTable, usageBar, appBase, logoUrl } from "./layout";

describe("appBase", () => {
  it("returns NEXT_PUBLIC_APP_URL when set", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://test.pagebee.com";
    expect(appBase()).toBe("https://test.pagebee.com");
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it("falls back to localhost:3000 when not set", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(appBase()).toBe("http://localhost:3000");
  });
});

describe("renderLayout", () => {
  it("includes body HTML in the output", () => {
    const html = renderLayout({ body: "<p>Hello World</p>" });
    expect(html).toContain("<p>Hello World</p>");
  });

  it("renders the preheader when provided and escapes it", () => {
    const html = renderLayout({ body: "", preheader: "Preview text & more" });
    expect(html).toContain("Preview text &amp; more");
  });

  it("renders the unsubscribe link when unsubscribeUrl is provided", () => {
    const html = renderLayout({ body: "", unsubscribeUrl: "https://pagebee.com/unsub/tok" });
    expect(html).toContain("https://pagebee.com/unsub/tok");
    expect(html).toContain("Unsubscribe");
  });

  it("includes recipientLabel in the unsubscribe footer", () => {
    const html = renderLayout({ body: "", unsubscribeUrl: "https://x.com/u", recipientLabel: "Acme Corp" });
    expect(html).toContain("Acme Corp");
  });

  it("does NOT render unsubscribe footer when no unsubscribeUrl", () => {
    const html = renderLayout({ body: "" });
    expect(html).not.toContain("Unsubscribe");
  });

  it("is a valid HTML document with doctype", () => {
    const html = renderLayout({ body: "" });
    expect(html).toMatch(/^<!doctype html>/i);
  });
});

describe("button", () => {
  it("renders a link with the label and url", () => {
    const result = button("Click Me", "https://example.com");
    expect(result).toContain("Click Me");
    expect(result).toContain("https://example.com");
    expect(result).toContain("<a ");
  });

  it("escapes the label to prevent XSS", () => {
    const result = button("<script>alert('xss')</script>", "https://safe.com");
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
  });
});

describe("linkFallback", () => {
  it("renders the URL as both href and text", () => {
    const url = "https://example.com/reset/token";
    const result = linkFallback(url);
    expect(result).toContain(url);
    expect(result).toContain("paste this link");
  });
});

describe("panel", () => {
  it("wraps body content in a styled table", () => {
    const result = panel("<strong>Key info</strong>");
    expect(result).toContain("<strong>Key info</strong>");
    expect(result).toContain("border-radius");
  });
});

describe("divider", () => {
  it("renders a horizontal divider div", () => {
    const result = divider();
    expect(result).toContain("height:1px");
  });
});

describe("detailTable", () => {
  it("renders each row with key and value", () => {
    const result = detailTable([["Amount", "$99.00"], ["Date", "2024-01-01"]]);
    expect(result).toContain("Amount");
    expect(result).toContain("$99.00");
    expect(result).toContain("Date");
    expect(result).toContain("2024-01-01");
  });

  it("escapes key values", () => {
    const result = detailTable([["<b>Key</b>", "Value"]]);
    expect(result).toContain("&lt;b&gt;Key&lt;/b&gt;");
  });
});

describe("usageBar", () => {
  it("renders green for low usage", () => {
    const result = usageBar(50);
    expect(result).toContain("#10b981");
    expect(result).toContain('width="50%"');
  });

  it("renders amber for 75%+ usage", () => {
    const result = usageBar(80);
    expect(result).toContain("#f59e0b");
  });

  it("renders red for 90%+ usage", () => {
    const result = usageBar(95);
    expect(result).toContain("#dc2626");
  });

  it("clamps to 0 for negative input", () => {
    const result = usageBar(-10);
    expect(result).toContain('width="0%"');
  });

  it("clamps to 100 for over-100 input", () => {
    const result = usageBar(150);
    expect(result).toContain('width="100%"');
  });
});
