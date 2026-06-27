import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireCapability: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/knowledge", () => ({
  deleteDocument: vi.fn(),
}));

import { DELETE } from "./route";
import { requireCapability } from "@/lib/auth/session";
import { deleteDocument } from "@/lib/modules/knowledge";

beforeEach(() => {
  vi.clearAllMocks();
});

const req = () => new Request("http://localhost/api/v1/client/knowledge/documents/doc-x", { method: "DELETE" });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

// ─── DELETE ───────────────────────────────────────────────────────────────────

describe("DELETE /api/v1/client/knowledge/documents/[id]", () => {
  it("returns 401 when the caller is unauthenticated", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(401));

    const res = await DELETE(req(), params("doc-x"));
    expect(res.status).toBe(401);
    expect(deleteDocument).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller lacks manage capability", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new AuthError(403));

    const res = await DELETE(req(), params("doc-x"));
    expect(res.status).toBe(403);
  });

  it("calls deleteDocument with the clientId from the guard and the url param id", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: { id: "c1" } } as never);
    vi.mocked(deleteDocument).mockResolvedValue(undefined);

    const res = await DELETE(req(), params("doc-x"));

    expect(res.status).toBe(200);
    expect(requireCapability).toHaveBeenCalledWith("website", "manage");
    expect(deleteDocument).toHaveBeenCalledWith("c1", "doc-x");
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("scopes deletion to the authenticated tenant (IDOR guard — passes clientId, not a body id)", async () => {
    vi.mocked(requireCapability).mockResolvedValue({ client: { id: "tenant-A" } } as never);
    vi.mocked(deleteDocument).mockResolvedValue(undefined);

    await DELETE(req(), params("doc-belongs-to-B"));

    // The service is responsible for the actual IDOR check; the route must pass clientId
    expect(deleteDocument).toHaveBeenCalledWith("tenant-A", "doc-belongs-to-B");
  });
});
