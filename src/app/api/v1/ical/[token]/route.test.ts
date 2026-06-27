import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/modules/booking/ical", () => ({
  verifyIcalToken: vi.fn(),
  buildIcsFeed: vi.fn(),
}));

import { GET } from "./route";
import { verifyIcalToken, buildIcsFeed } from "@/lib/modules/booking/ical";

function makeReq(token: string) {
  return {
    req: new Request(`http://localhost/api/v1/ical/${token}`),
    ctx: { params: Promise.resolve({ token }) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/ical/[token]", () => {
  it("returns 404 when token is invalid", async () => {
    vi.mocked(verifyIcalToken).mockReturnValue(null);
    const { req, ctx } = makeReq("bad-token");
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
    expect(buildIcsFeed).not.toHaveBeenCalled();
  });

  it("strips .ics extension before verifying token", async () => {
    vi.mocked(verifyIcalToken).mockReturnValue(null);
    const { req, ctx } = makeReq("mytoken.ics");
    await GET(req, ctx);
    expect(verifyIcalToken).toHaveBeenCalledWith("mytoken");
  });

  it("returns ICS content with correct headers on valid token", async () => {
    const CLIENT_ID = "client_123";
    vi.mocked(verifyIcalToken).mockReturnValue(CLIENT_ID);
    const icsContent = "BEGIN:VCALENDAR\nEND:VCALENDAR";
    vi.mocked(buildIcsFeed).mockResolvedValue(icsContent as never);

    const { req, ctx } = makeReq("valid-token");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/calendar");
    expect(res.headers.get("Content-Disposition")).toContain("pagebee-appointments.ics");
    const text = await res.text();
    expect(text).toBe(icsContent);
    expect(buildIcsFeed).toHaveBeenCalledWith(CLIENT_ID);
  });

  it("passes correct clientId to buildIcsFeed", async () => {
    const CLIENT_ID = "client_abc";
    vi.mocked(verifyIcalToken).mockReturnValue(CLIENT_ID);
    vi.mocked(buildIcsFeed).mockResolvedValue("BEGIN:VCALENDAR" as never);

    const { req, ctx } = makeReq("some-token");
    await GET(req, ctx);
    expect(buildIcsFeed).toHaveBeenCalledWith(CLIENT_ID);
  });

  it("sets Cache-Control header for private caching", async () => {
    vi.mocked(verifyIcalToken).mockReturnValue("client_xyz");
    vi.mocked(buildIcsFeed).mockResolvedValue("BEGIN:VCALENDAR" as never);

    const { req, ctx } = makeReq("token");
    const res = await GET(req, ctx);
    expect(res.headers.get("Cache-Control")).toContain("private");
  });
});
