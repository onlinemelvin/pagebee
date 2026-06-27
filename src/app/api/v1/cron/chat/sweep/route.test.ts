import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/modules/chat", () => ({
  sweepChatEscalations: vi.fn(),
}));

import { GET } from "./route";
import { sweepChatEscalations } from "@/lib/modules/chat";

const SECRET = "cron-secret-abc";

function makeReq(opts: { auth?: string | null } = {}) {
  const auth = opts.auth === undefined ? `Bearer ${SECRET}` : opts.auth;
  const headers: Record<string, string> = {};
  if (auth !== null) headers["authorization"] = auth;
  return new Request("http://localhost/api/v1/cron/chat/sweep", { headers });
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

describe("GET /api/v1/cron/chat/sweep", () => {
  it("returns 503 when neither secret env var is configured", async () => {
    delete process.env.CRON_SECRET;
    delete process.env.INTERNAL_API_SECRET;
    const res = await GET(makeReq() as never);
    expect(res.status).toBe(503);
    expect(sweepChatEscalations).not.toHaveBeenCalled();
  });

  it("returns 401 when authorization header is missing", async () => {
    const res = await GET(makeReq({ auth: null }) as never);
    expect(res.status).toBe(401);
    expect(sweepChatEscalations).not.toHaveBeenCalled();
  });

  it("returns 401 when authorization header has wrong secret", async () => {
    const res = await GET(makeReq({ auth: "Bearer wrong-secret" }) as never);
    expect(res.status).toBe(401);
    expect(sweepChatEscalations).not.toHaveBeenCalled();
  });

  it("accepts INTERNAL_API_SECRET as fallback when CRON_SECRET is absent", async () => {
    delete process.env.CRON_SECRET;
    process.env.INTERNAL_API_SECRET = "internal-secret";
    vi.mocked(sweepChatEscalations).mockResolvedValue({ escalated: 0 } as never);

    const res = await GET(makeReq({ auth: "Bearer internal-secret" }) as never);
    expect(res.status).toBe(200);
    expect(sweepChatEscalations).toHaveBeenCalled();
  });

  it("returns 200 and sweep results on valid secret", async () => {
    vi.mocked(sweepChatEscalations).mockResolvedValue({ escalated: 3 } as never);

    const res = await GET(makeReq() as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, escalated: 3 });
    expect(sweepChatEscalations).toHaveBeenCalledTimes(1);
  });
});
