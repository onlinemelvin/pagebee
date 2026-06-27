import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";
import { SalesError } from "@/lib/modules/sales";

vi.mock("@/lib/auth/session", () => ({ requireRep: vi.fn(), AuthError }));
vi.mock("@/lib/modules/sales", async () => {
  const actual = await vi.importActual<typeof import("@/lib/modules/sales")>("@/lib/modules/sales");
  return { ...actual, signContract: vi.fn() };
});

import { POST } from "./route";
import { requireRep } from "@/lib/auth/session";
import { signContract } from "@/lib/modules/sales";

const rep = { ctx: { userId: "u1" }, employee: { id: "rep1" } };

function req(body: unknown): Request {
  return new Request("http://x/api/v1/rep/contract/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "9.9.9.9, 1.1.1.1" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

it("401 when not a rep", async () => {
  vi.mocked(requireRep).mockRejectedValue(new AuthError(401));
  const res = await POST(req({ fullName: "Jane", agree: true }));
  expect(res.status).toBe(401);
});

it("signs and returns the activated contract, forwarding the client IP", async () => {
  vi.mocked(requireRep).mockResolvedValue(rep as never);
  vi.mocked(signContract).mockResolvedValue({ id: "k1", status: "ACTIVE" } as never);
  const res = await POST(req({ fullName: "Jane Rep", agree: true }));
  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toEqual({ contract: { id: "k1", status: "ACTIVE" } });
  expect(signContract).toHaveBeenCalledWith("rep1", { fullName: "Jane Rep", agree: true }, { userId: "u1", ip: "9.9.9.9" });
});

it("maps already_signed to 409", async () => {
  vi.mocked(requireRep).mockResolvedValue(rep as never);
  vi.mocked(signContract).mockRejectedValue(new SalesError("already_signed", 409));
  const res = await POST(req({ fullName: "Jane Rep", agree: true }));
  expect(res.status).toBe(409);
  await expect(res.json()).resolves.toEqual({ error: "already_signed" });
});
