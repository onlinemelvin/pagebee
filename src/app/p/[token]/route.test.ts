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
    prismaMock.preview.findUnique.mockResolvedValue({ id: "pv1", clientId: "c1", status: "PREVIEW_SENT", viewedAt: null });
    prismaMock.preview.update.mockResolvedValue({});
    vi.mocked(getPreviewSiteForClient).mockResolvedValue({ html: "<html>site</html>", siteToken: "t" } as never);

    const res = await GET(new Request("http://x/p/tok"), ctx("tok"));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(serveTenant).toHaveBeenCalled();
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
