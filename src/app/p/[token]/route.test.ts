import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/website", () => ({ getPreviewSiteForClient: vi.fn() }));
vi.mock("@/lib/site/serve", () => ({
  serveTenant: vi.fn(() => new Response("<html>site</html>", { status: 200, headers: { "Content-Type": "text/html" } })),
}));

import { GET } from "./route";
import { getPreviewSiteForClient } from "@/lib/modules/website";
import { serveTenant } from "@/lib/site/serve";

function ctx(token: string) {
  return { params: Promise.resolve({ token }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Restore the serveTenant impl wiped by the global setup's resetAllMocks.
  vi.mocked(serveTenant).mockReturnValue(
    new Response("<html>site</html>", { status: 200, headers: { "Content-Type": "text/html" } }),
  );
});

describe("GET /p/[token]", () => {
  it("404s on an unknown token", async () => {
    prismaMock.preview.findUnique.mockResolvedValue(null);
    const res = await GET(new Request("http://x/p/nope"), ctx("nope"));
    expect(res.status).toBe(404);
    expect(serveTenant).not.toHaveBeenCalled();
  });

  it("serves the generated site (noindex) and records first view", async () => {
    prismaMock.preview.findUnique.mockResolvedValue({ id: "pv1", clientId: "c1", status: "PREVIEW_SENT", viewedAt: null, setupDiscountPct: 20, monthlyDiscountPct: 15 });
    prismaMock.preview.update.mockResolvedValue({});
    prismaMock.subscription.findUnique.mockResolvedValue({ agreedSetupFee: 69900, agreedMonthlyFee: 8900 });
    vi.mocked(getPreviewSiteForClient).mockResolvedValue({ html: "<html>site</html>", siteToken: "t" } as never);

    const res = await GET(new Request("http://x/p/tok"), ctx("tok"));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(serveTenant).toHaveBeenCalled();
    // The public footer's "Ready to launch" CTA carries this preview's token into signup, and the
    // discounted price (20% off setup) is passed through for the footer.
    const opts = vi.mocked(serveTenant).mock.calls[0][3] as { launchUrl?: string; price?: Record<string, number> } | undefined;
    expect(opts?.launchUrl).toContain("/register?previewToken=tok");
    // 20% off setup ($559.20) + a 15% first-year monthly promo ($75.65, 12 months).
    expect(opts?.price).toMatchObject({ setupCents: 69900, setupAfterDiscountCents: 55920, monthlyCents: 8900, monthlyAfterDiscountCents: 7565, promoMonths: 12 });
    // first view recorded → PREVIEW_VIEWED
    expect(prismaMock.preview.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PREVIEW_VIEWED" }) }),
    );
  });

  it("shows the generating placeholder when the site isn't ready", async () => {
    prismaMock.preview.findUnique.mockResolvedValue({ id: "pv1", clientId: "c1", status: "PREVIEW_GENERATING", viewedAt: new Date() });
    vi.mocked(getPreviewSiteForClient).mockResolvedValue(null as never);
    const res = await GET(new Request("http://x/p/tok"), ctx("tok"));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Building your website preview");
    expect(serveTenant).not.toHaveBeenCalled();
  });
});
