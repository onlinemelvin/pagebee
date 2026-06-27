import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError } from "@/lib/auth/errors";

vi.mock("@/lib/auth/session", () => ({
  requireClient: vi.fn(),
  AuthError,
}));
vi.mock("@/lib/modules/client", () => ({
  getClientWorkspace: vi.fn(),
  setClientFeature: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { GET, POST } from "./route";
import { requireClient } from "@/lib/auth/session";
import { getClientWorkspace, setClientFeature } from "@/lib/modules/client";

beforeEach(() => {
  vi.clearAllMocks();
});

const mockResult = {
  ctx: { userId: "user-1", email: "owner@test.com" },
  client: { id: "client-1" },
  role: "owner",
  permissions: [],
};

const mockFeatures = [
  { toggleKey: "gallery", state: "enabled", blockedReason: null },
  { toggleKey: "booking", state: "locked", blockedReason: null },
];

describe("GET /api/v1/client/features", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireClient).mockRejectedValue(new AuthError(401));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(getClientWorkspace).not.toHaveBeenCalled();
  });

  it("returns 401 when workspace not found", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    vi.mocked(getClientWorkspace).mockResolvedValue(null as never);

    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns features on success", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    vi.mocked(getClientWorkspace).mockResolvedValue({ features: mockFeatures } as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ features: mockFeatures });
  });
});

describe("POST /api/v1/client/features", () => {
  const postReq = (body: unknown) =>
    new Request("http://localhost/api/v1/client/features", {
      method: "POST",
      body: JSON.stringify(body),
    });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireClient).mockRejectedValue(new AuthError(401));
    const res = await POST(postReq({ key: "gallery", enabled: true }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing key", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    const res = await POST(postReq({ enabled: true }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_error");
  });

  it("returns 400 for unknown feature key", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    vi.mocked(getClientWorkspace).mockResolvedValue({ features: mockFeatures } as never);

    const res = await POST(postReq({ key: "nonexistent", enabled: true }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("unknown_feature");
  });

  it("returns 403 when feature is locked in the plan", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    vi.mocked(getClientWorkspace).mockResolvedValue({ features: mockFeatures } as never);

    const res = await POST(postReq({ key: "booking", enabled: true }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("feature_not_in_plan");
  });

  it("returns 409 when feature has a blockedReason (no page room)", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    const featuresWithBlocked = [
      { toggleKey: "gallery", state: "enabled", blockedReason: "No slots remaining" },
    ];
    vi.mocked(getClientWorkspace).mockResolvedValue({ features: featuresWithBlocked } as never);

    const res = await POST(postReq({ key: "gallery", enabled: true }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("no_page_room");
  });

  it("toggles a feature and returns ok on success", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    vi.mocked(getClientWorkspace).mockResolvedValue({ features: mockFeatures } as never);
    vi.mocked(setClientFeature).mockResolvedValue(undefined as never);

    const res = await POST(postReq({ key: "gallery", enabled: false }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(setClientFeature).toHaveBeenCalledWith("client-1", "gallery", false);
  });

  it("returns 401 when workspace not found after auth", async () => {
    vi.mocked(requireClient).mockResolvedValue(mockResult as never);
    vi.mocked(getClientWorkspace).mockResolvedValue(null as never);

    const res = await POST(postReq({ key: "gallery", enabled: true }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });
});
