import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireOwner: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/payments", () => ({
  uploadIdentityDocument: vi.fn(),
  PaymentError: class PaymentError extends Error {
    code: string;
    status: number;
    constructor(status: number, code: string) {
      super(code);
      this.status = status;
      this.code = code;
    }
  },
}));

import { POST } from "./route";
import { requireOwner } from "@/lib/auth/session";
import { uploadIdentityDocument, PaymentError } from "@/lib/modules/payments";

const makeOwner = (clientId = "c1") => ({
  client: { id: clientId },
  ctx: { userId: "u1" },
  role: "owner",
  permissions: [],
});

/** Build a multipart FormData request with a file attachment. */
const makeFormReq = (opts: { file?: File | null; side?: string } = {}) => {
  const form = new FormData();
  if (opts.file !== undefined) {
    if (opts.file !== null) form.append("file", opts.file);
  } else {
    form.append("file", new File([new Uint8Array(10)], "id.jpg", { type: "image/jpeg" }));
  }
  if (opts.side !== undefined) form.append("side", opts.side);
  return new Request("http://localhost/api/v1/client/payments/document", {
    method: "POST",
    body: form,
  });
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/client/payments/document", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(401));
    const res = await POST(makeFormReq());
    expect(res.status).toBe(401);
    expect(uploadIdentityDocument).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not owner", async () => {
    vi.mocked(requireOwner).mockRejectedValue(new AuthError(403));
    const res = await POST(makeFormReq());
    expect(res.status).toBe(403);
  });

  it("returns 400 when file field is missing", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    const form = new FormData();
    const res = await POST(
      new Request("http://localhost/api/v1/client/payments/document", { method: "POST", body: form }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "file_required" });
    expect(uploadIdentityDocument).not.toHaveBeenCalled();
  });

  it("returns 400 when file exceeds 10 MB", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    const bigFile = new File([new Uint8Array(11 * 1024 * 1024)], "big.jpg", { type: "image/jpeg" });
    const res = await POST(makeFormReq({ file: bigFile }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "file_too_large" });
  });

  it("returns 400 for unsupported file type", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    const badFile = new File([new Uint8Array(10)], "doc.gif", { type: "image/gif" });
    const res = await POST(makeFormReq({ file: badFile }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "unsupported_type" });
  });

  it("calls uploadIdentityDocument with clientId from guard and defaults side to front", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner("c-doc") as never);
    vi.mocked(uploadIdentityDocument).mockResolvedValue("pending" as never);

    const res = await POST(makeFormReq());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ state: "pending" });
    expect(uploadIdentityDocument).toHaveBeenCalledWith(
      "c-doc",
      "front",
      expect.objectContaining({ name: "id.jpg", type: "image/jpeg" }),
    );
  });

  it("passes side=back to uploadIdentityDocument", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner("c-back") as never);
    vi.mocked(uploadIdentityDocument).mockResolvedValue("pending" as never);

    const res = await POST(makeFormReq({ side: "back" }));
    expect(res.status).toBe(200);
    expect(uploadIdentityDocument).toHaveBeenCalledWith(
      "c-back",
      "back",
      expect.any(Object),
    );
  });

  it("returns PaymentError status on payment failure", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    vi.mocked(uploadIdentityDocument).mockRejectedValue(new PaymentError(422, "no_account"));

    const res = await POST(makeFormReq());
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: "no_account" });
  });

  it("returns 500 on unexpected error", async () => {
    vi.mocked(requireOwner).mockResolvedValue(makeOwner() as never);
    vi.mocked(uploadIdentityDocument).mockRejectedValue(new Error("unexpected"));

    const res = await POST(makeFormReq());
    expect(res.status).toBe(500);
  });
});
