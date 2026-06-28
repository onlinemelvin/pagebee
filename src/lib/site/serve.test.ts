import { describe, it, expect } from "vitest";
import { serveTenant } from "./serve";
import type { ServeSite } from "@/lib/modules/website";

function previewSite(): ServeSite {
  return {
    kind: "preview",
    siteToken: "tok",
    html: "<html><head></head><body><main>Hi</main></body></html>",
  };
}

async function bodyOf(res: Response) {
  return res.text();
}

describe("serveTenant — public prospect preview footer", () => {
  it("renders the non-overlay 'Ready to launch' footer when a launchUrl is given", async () => {
    const res = serveTenant(previewSite(), new Request("http://acme.localhost/"), undefined, {
      launchUrl: "http://localhost:3000/register?previewToken=tok",
    });
    const html = await bodyOf(res);

    expect(html).toContain("Ready to launch");
    expect(html).toContain("/register?previewToken=tok");
    expect(html).toContain("FREE PREVIEW");
    // We don't reserve bottom padding for the in-flow footer.
    expect(html).not.toContain("padding-bottom:80px");
    expect(html).toContain('role="contentinfo"');

    // The footer div itself must create NO stacking context (no position / no z-index) so the site's
    // own fixed widgets (chat bubble) paint above it rather than being hidden under it.
    const footerOpenTag = html.slice(html.indexOf('role="contentinfo"'));
    const footerStyle = footerOpenTag.slice(0, footerOpenTag.indexOf(">"));
    expect(footerStyle).not.toContain("position:");
    expect(footerStyle).not.toContain("z-index");
  });

  it("shows the plan price (setup + monthly) in the footer, with a strikethrough when discounted", async () => {
    const res = serveTenant(previewSite(), new Request("http://acme.localhost/"), undefined, {
      launchUrl: "http://localhost:3000/register?previewToken=tok",
      price: { setupCents: 69900, setupAfterDiscountCents: 55920, monthlyCents: 8900, monthlyAfterDiscountCents: 8900, promoMonths: 0 },
    });
    const html = await bodyOf(res);
    // Discounted setup shown alongside the struck-through full price, plus the monthly fee.
    expect(html).toContain("$699"); // full setup (strikethrough)
    expect(html).toContain("<s");
    expect(html).toContain("$559.20"); // discounted setup
    expect(html).toContain("$89</strong>/mo");
  });

  it("shows a first-year monthly promo (discounted → reverts) in the footer", async () => {
    const res = serveTenant(previewSite(), new Request("http://acme.localhost/"), undefined, {
      launchUrl: "http://localhost:3000/register?previewToken=tok",
      price: { setupCents: 69900, setupAfterDiscountCents: 69900, monthlyCents: 8900, monthlyAfterDiscountCents: 7565, promoMonths: 12 },
    });
    const html = await bodyOf(res);
    expect(html).toContain("$75.65</strong>/mo for 12 mo");
    expect(html).toContain("then $89/mo");
  });

  it("shows only the full setup price when there is no discount", async () => {
    const res = serveTenant(previewSite(), new Request("http://acme.localhost/"), undefined, {
      launchUrl: "http://localhost:3000/register?previewToken=tok",
      price: { setupCents: 39900, setupAfterDiscountCents: 39900, monthlyCents: 3900, monthlyAfterDiscountCents: 3900, promoMonths: 0 },
    });
    const html = await bodyOf(res);
    expect(html).toContain("$399");
    expect(html).toContain("$39</strong>/mo");
    expect(html).not.toContain("<s "); // no strikethrough without a discount
  });

  it("keeps noindex on the public preview", async () => {
    const res = serveTenant(previewSite(), new Request("http://acme.localhost/"), undefined, {
      launchUrl: "http://localhost:3000/register?previewToken=tok",
    });
    expect(await bodyOf(res)).toContain('name="robots" content="noindex"');
  });

  it("falls back to the fixed owner banner (no launch CTA) when no launchUrl is given", async () => {
    const res = serveTenant(previewSite(), new Request("http://acme.localhost/"));
    const html = await bodyOf(res);
    // Owner review frame keeps the fixed status bar + bottom-padding reservation, and has no signup CTA.
    expect(html).toContain("padding-bottom:80px");
    expect(html).not.toContain("Ready to launch");
    expect(html).not.toContain("previewToken");
  });

  it("does not apply preview mode to a published site", async () => {
    const published: ServeSite = { ...previewSite(), kind: "published" };
    const res = serveTenant(published, new Request("http://acme.com/"), undefined, {
      launchUrl: "http://localhost:3000/register?previewToken=tok",
    });
    const html = await bodyOf(res);
    expect(html).not.toContain("Ready to launch");
    expect(html).not.toContain("FREE PREVIEW");
  });
});
