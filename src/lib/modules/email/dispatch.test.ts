import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("./send", () => ({
  sendEmail: vi.fn(),
  escapeHtml: (s: string) => s,
}));
vi.mock("./layout", () => ({
  renderLayout: vi.fn().mockReturnValue("<html>layout</html>"),
  appBase: vi.fn().mockReturnValue("http://localhost:3000"),
}));
vi.mock("./preferences", () => ({
  isSuppressed: vi.fn().mockResolvedValue(false),
  unsubscribeUrlFor: vi.fn().mockResolvedValue({
    pageUrl: "http://localhost:3000/unsubscribe/tok",
    oneClickUrl: "http://localhost:3000/api/v1/public/unsubscribe?token=tok",
    token: "tok",
  }),
}));

import { dispatch } from "./dispatch";
import { sendEmail } from "./send";
import { isSuppressed } from "./preferences";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dispatch", () => {
  const baseParams = {
    to: "user@example.com",
    subject: "Test Subject",
    body: "<p>Hello</p>",
    category: "BILLING" as never,
  };

  it("creates a QUEUED log, sends the email, and updates to SENT", async () => {
    prismaMock.emailLog.create.mockResolvedValue({ id: "log1" } as never);
    prismaMock.emailLog.update.mockResolvedValue({} as never);
    vi.mocked(sendEmail).mockResolvedValue({ id: "resend-id-1", stubbed: false });

    const result = await dispatch(baseParams);

    expect(prismaMock.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "QUEUED" }) }),
    );
    expect(sendEmail).toHaveBeenCalled();
    expect(prismaMock.emailLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SENT", providerId: "resend-id-1" }) }),
    );
    expect(result.status).toBe("SENT");
    expect(result.logId).toBe("log1");
  });

  it("returns STUBBED status when send returns stubbed=true", async () => {
    prismaMock.emailLog.create.mockResolvedValue({ id: "log2" } as never);
    prismaMock.emailLog.update.mockResolvedValue({} as never);
    vi.mocked(sendEmail).mockResolvedValue({ id: null, stubbed: true });

    const result = await dispatch(baseParams);
    expect(result.status).toBe("STUBBED");
  });

  it("returns FAILED and logs error when sendEmail throws", async () => {
    prismaMock.emailLog.create.mockResolvedValue({ id: "log3" } as never);
    prismaMock.emailLog.update.mockResolvedValue({} as never);
    vi.mocked(sendEmail).mockRejectedValue(new Error("provider down"));

    const result = await dispatch(baseParams);
    expect(result.status).toBe("FAILED");
    expect(prismaMock.emailLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED", error: "provider down" }) }),
    );
  });

  it("suppresses marketing email and logs FAILED with suppressed reason", async () => {
    vi.mocked(isSuppressed).mockResolvedValue(true);
    prismaMock.emailLog.create.mockResolvedValue({ id: "log4" } as never);

    const result = await dispatch({ ...baseParams, category: "TIPS" as never });

    expect(result.status).toBe("SUPPRESSED");
    expect(prismaMock.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED", error: "suppressed:unsubscribed" }),
      }),
    );
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("skips suppression check for transactional email", async () => {
    prismaMock.emailLog.create.mockResolvedValue({ id: "log5" } as never);
    prismaMock.emailLog.update.mockResolvedValue({} as never);
    vi.mocked(sendEmail).mockResolvedValue({ id: "rid", stubbed: false });
    vi.mocked(isSuppressed).mockResolvedValue(true); // would suppress if checked

    // BILLING is transactional — isSuppressed should NOT be called
    const result = await dispatch({ ...baseParams, category: "BILLING" as never });
    expect(isSuppressed).not.toHaveBeenCalled();
    expect(result.status).toBe("SENT");
  });

  it("uses rawHtml body directly without wrapping in layout", async () => {
    prismaMock.emailLog.create.mockResolvedValue({ id: "log6" } as never);
    prismaMock.emailLog.update.mockResolvedValue({} as never);
    vi.mocked(sendEmail).mockResolvedValue({ id: "rid", stubbed: false });

    const rawBody = "<!doctype html><html><body>raw</body></html>";
    await dispatch({ ...baseParams, body: rawBody, rawHtml: true });

    const sendCall = vi.mocked(sendEmail).mock.calls[0][0];
    expect(sendCall.html).toBe(rawBody);
  });

  it("trims whitespace from the to address", async () => {
    prismaMock.emailLog.create.mockResolvedValue({ id: "log7" } as never);
    prismaMock.emailLog.update.mockResolvedValue({} as never);
    vi.mocked(sendEmail).mockResolvedValue({ id: "rid", stubbed: false });

    await dispatch({ ...baseParams, to: "  user@example.com  " });
    const sendCall = vi.mocked(sendEmail).mock.calls[0][0];
    expect(sendCall.to).toBe("user@example.com");
  });

  it("passes clientId and campaignId to the log row", async () => {
    prismaMock.emailLog.create.mockResolvedValue({ id: "log8" } as never);
    prismaMock.emailLog.update.mockResolvedValue({} as never);
    vi.mocked(sendEmail).mockResolvedValue({ id: "rid", stubbed: false });

    await dispatch({ ...baseParams, clientId: "c1", campaignId: "camp1" });

    expect(prismaMock.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ clientId: "c1", campaignId: "camp1" }),
      }),
    );
  });
});
