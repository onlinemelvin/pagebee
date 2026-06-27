import { describe, it, expect, vi, beforeEach } from "vitest";

const { RegistrationError, registerSchema } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- hoisted factory runs before ES imports initialize
  const { z } = require("zod");
  return {
    RegistrationError: class RegistrationError extends Error {
      constructor(public code: string, public status: number) {
        super(code);
      }
    },
    registerSchema: z.object({
      email: z.string().email(),
      password: z.string().min(8),
      businessName: z.string().min(1),
      businessType: z.string().min(1),
      plan: z.string().min(1),
    }),
  };
});
vi.mock("@/lib/modules/registration", () => ({
  registerClient: vi.fn(),
  registerSchema,
  RegistrationError,
}));
vi.mock("@/lib/posthog-server", () => ({
  getPostHogClient: vi.fn(() => ({ capture: vi.fn() })),
}));

import { POST } from "./route";
import { registerClient } from "@/lib/modules/registration";
import { getPostHogClient } from "@/lib/posthog-server";

const valid = {
  email: "a@b.com",
  password: "password1",
  businessName: "Acme",
  businessType: "salon",
  plan: "NECTAR",
};
const req = (body: unknown) =>
  new Request("http://localhost/api/v1/public/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  // resetAllMocks (global setup) wipes factory implementations — re-apply.
  vi.mocked(getPostHogClient).mockReturnValue({ capture: vi.fn() } as never);
});

describe("POST /api/v1/public/register", () => {
  it("400 on validation failure", async () => {
    const res = await POST(req({ email: "bad" }));
    expect(res.status).toBe(400);
    expect(registerClient).not.toHaveBeenCalled();
  });

  it("maps RegistrationError to its status/code", async () => {
    vi.mocked(registerClient).mockRejectedValue(new RegistrationError("email_taken", 409));
    const res = await POST(req(valid));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "email_taken" });
  });

  it("happy path: registers the client", async () => {
    vi.mocked(registerClient).mockResolvedValue({ clientId: "c1" } as never);
    const res = await POST(req(valid));
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ clientId: "c1" });
    expect(registerClient).toHaveBeenCalledWith(expect.objectContaining({ email: "a@b.com" }));
  });
});
