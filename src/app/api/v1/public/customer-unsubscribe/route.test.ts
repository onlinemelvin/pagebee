import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/email", () => ({
  unsubscribeCustomerByToken: vi.fn(),
  verifyCustomerUnsubToken: vi.fn(),
  setCustomerEmailConsent: vi.fn(),
}));

import { GET, POST } from "./route";
import {
  unsubscribeCustomerByToken,
  verifyCustomerUnsubToken,
  setCustomerEmailConsent,
} from "@/lib/modules/email";

const get = (qs = "") =>
  new Request(`http://localhost/api/v1/public/customer-unsubscribe${qs}`);
const post = (qs: string, body: unknown) =>
  new Request(`http://localhost/api/v1/public/customer-unsubscribe${qs}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/public/customer-unsubscribe", () => {
  it("400 when token is missing", async () => {
    const res = await GET(get());
    expect(res.status).toBe(400);
  });

  it("404 when token does not verify", async () => {
    vi.mocked(verifyCustomerUnsubToken).mockReturnValue(null);
    const res = await GET(get("?token=bad"));
    expect(res.status).toBe(404);
  });

  it("happy path: returns the businessName", async () => {
    vi.mocked(verifyCustomerUnsubToken).mockReturnValue("cust1");
    prismaMock.customer.findUnique.mockResolvedValue({ client: { businessName: "Acme" } });
    const res = await GET(get("?token=good"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ businessName: "Acme" });
  });
});

describe("POST /api/v1/public/customer-unsubscribe", () => {
  it("400 when token is missing", async () => {
    const res = await POST(post("", {}));
    expect(res.status).toBe(400);
  });

  it("resubscribe re-grants consent", async () => {
    vi.mocked(verifyCustomerUnsubToken).mockReturnValue("cust1");
    vi.mocked(setCustomerEmailConsent).mockResolvedValue(undefined as never);
    const res = await POST(post("?token=good", { action: "resubscribe" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ state: "subscribed" });
    expect(setCustomerEmailConsent).toHaveBeenCalledWith("cust1", true, "resubscribe_link");
  });

  it("404 on an invalid token (unsubscribe)", async () => {
    vi.mocked(unsubscribeCustomerByToken).mockResolvedValue(null as never);
    const res = await POST(post("?token=bad", {}));
    expect(res.status).toBe(404);
  });

  it("happy path: unsubscribes the customer", async () => {
    vi.mocked(unsubscribeCustomerByToken).mockResolvedValue({ businessName: "Acme" } as never);
    const res = await POST(post("?token=good", {}));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ state: "unsubscribed", businessName: "Acme" });
  });
});
