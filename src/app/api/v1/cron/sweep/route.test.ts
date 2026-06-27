import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The route uses dynamic import() for these modules — vi.mock still intercepts them.
vi.mock("@/lib/modules/booking", () => ({
  sweepBookingReminders: vi.fn(),
}));
vi.mock("@/lib/modules/finance", () => ({
  sweepInvoiceReminders: vi.fn(),
  sweepRecurringPlans: vi.fn(),
}));
vi.mock("@/lib/modules/email/sweep", () => ({
  sweepScheduledCampaigns: vi.fn(),
  sweepEmailReminders: vi.fn(),
}));
vi.mock("@/lib/modules/email/sending-domains", () => ({
  sweepSendingDomains: vi.fn(),
}));

import { GET } from "./route";
import { sweepBookingReminders } from "@/lib/modules/booking";
import { sweepInvoiceReminders, sweepRecurringPlans } from "@/lib/modules/finance";
import { sweepScheduledCampaigns, sweepEmailReminders } from "@/lib/modules/email/sweep";
import { sweepSendingDomains } from "@/lib/modules/email/sending-domains";

const SECRET = "cron-sweep-secret";

function makeReq(opts: { auth?: string | null } = {}) {
  const auth = opts.auth === undefined ? `Bearer ${SECRET}` : opts.auth;
  const headers: Record<string, string> = {};
  if (auth !== null) headers["authorization"] = auth;
  return new Request("http://localhost/api/v1/cron/sweep", { headers });
}

function stubAllSweeps() {
  vi.mocked(sweepBookingReminders).mockResolvedValue({ sent: 0 } as never);
  vi.mocked(sweepInvoiceReminders).mockResolvedValue({ sent: 0 } as never);
  vi.mocked(sweepRecurringPlans).mockResolvedValue({ created: 0 } as never);
  vi.mocked(sweepScheduledCampaigns).mockResolvedValue({ sent: 0 } as never);
  vi.mocked(sweepEmailReminders).mockResolvedValue({ sent: 0 } as never);
  vi.mocked(sweepSendingDomains).mockResolvedValue({ checked: 0 } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  delete process.env.INTERNAL_API_SECRET;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.INTERNAL_API_SECRET;
});

describe("GET /api/v1/cron/sweep", () => {
  it("returns 503 when neither secret env var is configured", async () => {
    delete process.env.CRON_SECRET;
    delete process.env.INTERNAL_API_SECRET;
    const res = await GET(makeReq() as never);
    expect(res.status).toBe(503);
  });

  it("returns 401 when authorization header is missing", async () => {
    const res = await GET(makeReq({ auth: null }) as never);
    expect(res.status).toBe(401);
  });

  it("returns 401 when authorization header has wrong secret", async () => {
    const res = await GET(makeReq({ auth: "Bearer wrong-secret" }) as never);
    expect(res.status).toBe(401);
  });

  it("accepts INTERNAL_API_SECRET as fallback when CRON_SECRET is absent", async () => {
    delete process.env.CRON_SECRET;
    process.env.INTERNAL_API_SECRET = "internal-secret";
    stubAllSweeps();

    const res = await GET(makeReq({ auth: "Bearer internal-secret" }) as never);
    expect(res.status).toBe(200);
  });

  it("calls all sweep functions and returns combined results on valid secret", async () => {
    vi.mocked(sweepBookingReminders).mockResolvedValue({ sent: 1 } as never);
    vi.mocked(sweepInvoiceReminders).mockResolvedValue({ sent: 2 } as never);
    vi.mocked(sweepRecurringPlans).mockResolvedValue({ created: 3 } as never);
    vi.mocked(sweepScheduledCampaigns).mockResolvedValue({ sent: 4 } as never);
    vi.mocked(sweepEmailReminders).mockResolvedValue({ sent: 5 } as never);
    vi.mocked(sweepSendingDomains).mockResolvedValue({ checked: 6 } as never);

    const res = await GET(makeReq() as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body).toHaveProperty("bookingReminders");
    expect(body).toHaveProperty("invoiceReminders");
    expect(body).toHaveProperty("recurringPlans");
    expect(body).toHaveProperty("scheduledCampaigns");
    expect(body).toHaveProperty("emailReminders");
    expect(body).toHaveProperty("sendingDomains");
    expect(sweepBookingReminders).toHaveBeenCalledTimes(1);
    expect(sweepInvoiceReminders).toHaveBeenCalledTimes(1);
    expect(sweepRecurringPlans).toHaveBeenCalledTimes(1);
    expect(sweepScheduledCampaigns).toHaveBeenCalledTimes(1);
    expect(sweepEmailReminders).toHaveBeenCalledTimes(1);
    expect(sweepSendingDomains).toHaveBeenCalledTimes(1);
  });

  it("isolates failures — one sweep error does not prevent others from running", async () => {
    vi.mocked(sweepBookingReminders).mockRejectedValue(new Error("booking db down"));
    vi.mocked(sweepInvoiceReminders).mockResolvedValue({ sent: 1 } as never);
    vi.mocked(sweepRecurringPlans).mockResolvedValue({ created: 0 } as never);
    vi.mocked(sweepScheduledCampaigns).mockResolvedValue({ sent: 0 } as never);
    vi.mocked(sweepEmailReminders).mockResolvedValue({ sent: 0 } as never);
    vi.mocked(sweepSendingDomains).mockResolvedValue({ checked: 0 } as never);

    const res = await GET(makeReq() as never);
    // Still returns 200 — errors are captured per-step, not thrown
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // The failed step records the error string
    expect((body.bookingReminders as { error: string }).error).toMatch("booking db down");
    // Other steps ran normally
    expect(sweepInvoiceReminders).toHaveBeenCalled();
  });
});
