import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/messaging", () => ({
  classifyInbound: vi.fn(),
  recordOptOut: vi.fn(),
  recordOptIn: vi.fn(),
}));
vi.mock("@/lib/sms/twilio", () => ({ validateTwilioSignature: vi.fn() }));

import { POST } from "./route";
import { classifyInbound, recordOptOut, recordOptIn } from "@/lib/modules/messaging";
import { validateTwilioSignature } from "@/lib/sms/twilio";

const req = (body: Record<string, string>) =>
  new Request("http://localhost/api/v1/public/sms/inbound", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": "sig" },
    body: new URLSearchParams(body).toString(),
  });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/public/sms/inbound", () => {
  it("403 when the Twilio signature is invalid", async () => {
    vi.mocked(validateTwilioSignature).mockReturnValue(false);
    const res = await POST(req({ From: "+15551112222", Body: "STOP" }));
    expect(res.status).toBe(403);
    expect(recordOptOut).not.toHaveBeenCalled();
  });

  it("STOP records an opt-out and disables matching owner alerts", async () => {
    vi.mocked(validateTwilioSignature).mockReturnValue(true);
    vi.mocked(classifyInbound).mockReturnValue("stop" as never);
    vi.mocked(recordOptOut).mockResolvedValue(undefined as never);
    prismaMock.clientSetting.findMany.mockResolvedValue([]);
    const res = await POST(req({ From: "+15551112222", Body: "STOP" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/xml");
    expect(recordOptOut).toHaveBeenCalledWith("+15551112222", { reason: "user" });
  });

  it("START records an opt-in", async () => {
    vi.mocked(validateTwilioSignature).mockReturnValue(true);
    vi.mocked(classifyInbound).mockReturnValue("start" as never);
    vi.mocked(recordOptIn).mockResolvedValue(undefined as never);
    const res = await POST(req({ From: "+15551112222", Body: "START" }));
    expect(res.status).toBe(200);
    expect(recordOptIn).toHaveBeenCalledWith("+15551112222");
  });

  it("HELP replies with an informational TwiML message", async () => {
    vi.mocked(validateTwilioSignature).mockReturnValue(true);
    vi.mocked(classifyInbound).mockReturnValue("help" as never);
    const res = await POST(req({ From: "+15551112222", Body: "HELP" }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("<Message>");
  });

  it("unrecognized keyword sends an empty TwiML response", async () => {
    vi.mocked(validateTwilioSignature).mockReturnValue(true);
    vi.mocked(classifyInbound).mockReturnValue(null as never);
    const res = await POST(req({ From: "+15551112222", Body: "hello" }));
    expect(res.status).toBe(200);
    expect(recordOptOut).not.toHaveBeenCalled();
    expect(recordOptIn).not.toHaveBeenCalled();
  });
});
