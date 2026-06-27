import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/auth/site-token", () => ({
  getSiteToken: vi.fn(() => "tok"),
  resolveSite: vi.fn(),
}));
vi.mock("@/lib/modules/lead", () => ({ leadCaptureEnabled: vi.fn() }));
vi.mock("@/lib/modules/website", () => ({ getPreviewPlanOverride: vi.fn() }));
vi.mock("@/lib/site/lead-form", () => ({ defaultLeadFormHtml: vi.fn(() => "<default/>") }));
vi.mock("@/lib/site/lead-goals", () => ({
  goalToLeadType: vi.fn(() => "SERVICE_INQUIRY"),
  goalToCtaLabel: vi.fn(() => "Contact us"),
  goalToFormBlurb: vi.fn(() => "blurb"),
  goalToMessagePrompt: vi.fn(() => "prompt"),
}));

import { GET } from "./route";
import { resolveSite } from "@/lib/auth/site-token";
import { leadCaptureEnabled } from "@/lib/modules/lead";
import { defaultLeadFormHtml } from "@/lib/site/lead-form";
import {
  goalToLeadType,
  goalToCtaLabel,
  goalToFormBlurb,
  goalToMessagePrompt,
} from "@/lib/site/lead-goals";

const req = () =>
  new Request("http://localhost/api/v1/public/lead-form", {
    headers: { authorization: "Bearer tok" },
  });

beforeEach(() => {
  vi.clearAllMocks();
  // resetAllMocks (global setup) wipes factory implementations — re-apply.
  vi.mocked(defaultLeadFormHtml).mockReturnValue("<default/>");
  vi.mocked(goalToLeadType).mockReturnValue("SERVICE_INQUIRY");
  vi.mocked(goalToCtaLabel).mockReturnValue("Contact us");
  vi.mocked(goalToFormBlurb).mockReturnValue("blurb");
  vi.mocked(goalToMessagePrompt).mockReturnValue("prompt");
});

describe("GET /api/v1/public/lead-form", () => {
  it("401 when the site token does not resolve", async () => {
    vi.mocked(resolveSite).mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(leadCaptureEnabled).not.toHaveBeenCalled();
  });

  it("returns enabled:false (with ctaLabel) when lead capture is off", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    prismaMock.website.findFirst.mockResolvedValue({
      leadFormGoal: null,
      publishedVersion: null,
      versions: [],
    });
    vi.mocked(leadCaptureEnabled).mockResolvedValue(false);
    const res = await GET(req());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ enabled: false, ctaLabel: "Contact us" });
  });

  it("happy path: returns stored leadFormHtml + goal-derived fields", async () => {
    vi.mocked(resolveSite).mockResolvedValue({ websiteId: "w", clientId: "c1", status: "live" });
    prismaMock.website.findFirst.mockResolvedValue({
      leadFormGoal: "CONTACT",
      publishedVersion: { leadFormHtml: "<form/>" },
      versions: [],
    });
    vi.mocked(leadCaptureEnabled).mockResolvedValue(true);
    const res = await GET(req());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      enabled: true,
      html: "<form/>",
      leadType: "SERVICE_INQUIRY",
      ctaLabel: "Contact us",
    });
    expect(leadCaptureEnabled).toHaveBeenCalledWith("c1", undefined);
  });
});
