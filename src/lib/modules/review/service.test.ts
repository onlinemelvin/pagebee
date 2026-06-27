import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

// review/service.ts has no external side-effect dependencies to mock beyond prisma
import {
  listComments,
  addComment,
  updateComment,
  deleteComment,
  getCommentScope,
  openChangeRequestCount,
  openChangeRequestCounts,
  compileChangeRequest,
  markResolved,
} from "./service";

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Shared factories ──────────────────────────────────────────────────────────

function makeComment(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    versionId: "v1",
    parentId: null,
    authorType: "ADMIN" as const,
    authorId: "u1",
    authorName: "Alice",
    kind: "CHANGE_REQUEST" as const,
    status: "OPEN" as const,
    pagePath: "/",
    selector: "#hero h1",
    anchorText: "Welcome",
    x: 100,
    y: 200,
    body: "Change the headline",
    resolvedById: null,
    resolvedAt: null,
    createdAt: new Date("2024-01-01T10:00:00Z"),
    updatedAt: new Date("2024-01-01T10:00:00Z"),
    ...overrides,
  };
}

// ── listComments ──────────────────────────────────────────────────────────────

describe("listComments", () => {
  it("returns all comments mapped to DTOs with ISO date strings", async () => {
    prismaMock.websiteReviewComment.findMany.mockResolvedValue([makeComment()]);

    const result = await listComments("v1");

    expect(result).toHaveLength(1);
    expect(result[0].createdAt).toBe("2024-01-01T10:00:00.000Z");
    expect(result[0].resolvedAt).toBeNull();
    expect(result[0].id).toBe("c1");
    expect(prismaMock.websiteReviewComment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { versionId: "v1" }, orderBy: { createdAt: "asc" } }),
    );
  });

  it("maps resolvedAt to an ISO string when set", async () => {
    prismaMock.websiteReviewComment.findMany.mockResolvedValue([
      makeComment({ resolvedAt: new Date("2024-02-01T12:00:00Z"), resolvedById: "u2" }),
    ]);
    const result = await listComments("v1");
    expect(result[0].resolvedAt).toBe("2024-02-01T12:00:00.000Z");
    expect(result[0].resolvedById).toBe("u2");
  });
});

// ── addComment ────────────────────────────────────────────────────────────────

describe("addComment", () => {
  const author = { type: "CLIENT" as const, id: "u2", name: "Bob" };

  it("creates a top-level CHANGE_REQUEST with selector and anchor", async () => {
    const created = makeComment({ authorType: "CLIENT", authorId: "u2", authorName: "Bob" });
    prismaMock.websiteReviewComment.create.mockResolvedValue(created);

    const result = await addComment("v1", author, {
      kind: "CHANGE_REQUEST",
      pagePath: "/",
      selector: "#hero h1",
      anchorText: "Welcome",
      x: 100,
      y: 200,
      body: "Change the headline",
    });

    expect(result.id).toBe("c1");
    expect(prismaMock.websiteReviewComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "CHANGE_REQUEST",
          selector: "#hero h1",
          anchorText: "Welcome",
          authorType: "CLIENT",
        }),
      }),
    );
  });

  it("replies inherit kind NOTE and strip selector/anchor/position", async () => {
    const replyRow = makeComment({ kind: "NOTE", parentId: "c-parent", selector: null, anchorText: null, x: null, y: null });
    prismaMock.websiteReviewComment.create.mockResolvedValue(replyRow);

    await addComment("v1", author, {
      kind: "CHANGE_REQUEST",
      pagePath: "/",
      parentId: "c-parent",
      body: "Looks good",
    });

    expect(prismaMock.websiteReviewComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "NOTE",
          parentId: "c-parent",
          selector: null,
          anchorText: null,
          x: null,
          y: null,
        }),
      }),
    );
  });
});

// ── updateComment ─────────────────────────────────────────────────────────────

describe("updateComment", () => {
  const author = { type: "ADMIN" as const, id: "u1", name: "Alice" };

  it("sets resolvedById and resolvedAt when resolving", async () => {
    const resolved = makeComment({ status: "RESOLVED", resolvedById: "u1", resolvedAt: new Date() });
    prismaMock.websiteReviewComment.update.mockResolvedValue(resolved);

    await updateComment("c1", author, { status: "RESOLVED" });

    expect(prismaMock.websiteReviewComment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "RESOLVED", resolvedById: "u1" }),
      }),
    );
  });

  it("clears resolvedById and resolvedAt when reopening", async () => {
    const reopened = makeComment({ status: "OPEN", resolvedById: null, resolvedAt: null });
    prismaMock.websiteReviewComment.update.mockResolvedValue(reopened);

    await updateComment("c1", author, { status: "OPEN" });

    expect(prismaMock.websiteReviewComment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ resolvedById: null, resolvedAt: null }),
      }),
    );
  });

  it("updates only the body when status is not changing", async () => {
    prismaMock.websiteReviewComment.update.mockResolvedValue(makeComment({ body: "updated" }));

    await updateComment("c1", author, { body: "updated" });

    const call = (prismaMock.websiteReviewComment.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.body).toBe("updated");
    // No resolving or reopening fields
    expect(call.data.resolvedById).toBeUndefined();
    expect(call.data.resolvedAt).toBeUndefined();
  });
});

// ── deleteComment ─────────────────────────────────────────────────────────────

describe("deleteComment", () => {
  it("deletes the comment by id", async () => {
    prismaMock.websiteReviewComment.delete.mockResolvedValue({} as never);
    await deleteComment("c1");
    expect(prismaMock.websiteReviewComment.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
  });
});

// ── getCommentScope ───────────────────────────────────────────────────────────

describe("getCommentScope", () => {
  it("returns the scope with tenant clientId for authz", async () => {
    prismaMock.websiteReviewComment.findUnique.mockResolvedValue({
      id: "c1",
      versionId: "v1",
      authorType: "CLIENT",
      version: { website: { clientId: "tenant1" } },
    } as never);

    const scope = await getCommentScope("c1");

    expect(scope?.version.website.clientId).toBe("tenant1");
    expect(prismaMock.websiteReviewComment.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c1" }, select: expect.objectContaining({ versionId: true }) }),
    );
  });

  it("returns null for an unknown comment", async () => {
    prismaMock.websiteReviewComment.findUnique.mockResolvedValue(null);
    expect(await getCommentScope("bad-id")).toBeNull();
  });
});

// ── openChangeRequestCount ────────────────────────────────────────────────────

describe("openChangeRequestCount", () => {
  it("counts OPEN CHANGE_REQUEST comments for a version", async () => {
    prismaMock.websiteReviewComment.count.mockResolvedValue(3);
    const count = await openChangeRequestCount("v1");
    expect(count).toBe(3);
    expect(prismaMock.websiteReviewComment.count).toHaveBeenCalledWith({
      where: { versionId: "v1", kind: "CHANGE_REQUEST", status: "OPEN" },
    });
  });
});

// ── openChangeRequestCounts ───────────────────────────────────────────────────

describe("openChangeRequestCounts", () => {
  it("returns empty object for empty input", async () => {
    expect(await openChangeRequestCounts([])).toEqual({});
    expect(prismaMock.websiteReviewComment.groupBy).not.toHaveBeenCalled();
  });

  it("maps grouped counts by versionId", async () => {
    prismaMock.websiteReviewComment.groupBy.mockResolvedValue([
      { versionId: "v1", _count: { _all: 2 } },
      { versionId: "v2", _count: { _all: 5 } },
    ]);

    const result = await openChangeRequestCounts(["v1", "v2"]);

    expect(result).toEqual({ v1: 2, v2: 5 });
    expect(prismaMock.websiteReviewComment.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { versionId: { in: ["v1", "v2"] }, kind: "CHANGE_REQUEST", status: "OPEN" },
      }),
    );
  });
});

// ── compileChangeRequest ──────────────────────────────────────────────────────

describe("compileChangeRequest", () => {
  it("returns empty result when there are no open change requests", async () => {
    prismaMock.websiteReviewComment.findMany.mockResolvedValue([]);
    const result = await compileChangeRequest("v1");
    expect(result).toEqual({ note: "", commentIds: [], edits: [] });
  });

  it("compiles comments into a numbered instruction note", async () => {
    prismaMock.websiteReviewComment.findMany.mockResolvedValue([
      { id: "c1", pagePath: "/", selector: "#hero", anchorText: "Welcome", body: "Change to Acme Home" },
      { id: "c2", pagePath: "/about", selector: null, anchorText: null, body: "Rewrite the about section" },
    ]);

    const result = await compileChangeRequest("v1");

    expect(result.commentIds).toEqual(["c1", "c2"]);
    expect(result.note).toContain("1. [/ · near \"Welcome\"] Change to Acme Home");
    expect(result.note).toContain("2. [/about] Rewrite the about section");
    expect(result.edits).toHaveLength(2);
    expect(result.edits[0]).toEqual({
      pagePath: "/",
      selector: "#hero",
      anchorText: "Welcome",
      instruction: "Change to Acme Home",
    });
  });

  it("formats anchored and un-anchored comments correctly", async () => {
    prismaMock.websiteReviewComment.findMany.mockResolvedValue([
      { id: "c1", pagePath: "/services", selector: null, anchorText: null, body: "Add a call-to-action" },
    ]);

    const { note } = await compileChangeRequest("v1");

    expect(note).toContain("[/services] Add a call-to-action");
    expect(note).not.toContain("near");
  });
});

// ── markResolved ──────────────────────────────────────────────────────────────

describe("markResolved", () => {
  it("does nothing for an empty id list", async () => {
    await markResolved([], null);
    expect(prismaMock.websiteReviewComment.updateMany).not.toHaveBeenCalled();
  });

  it("bulk-updates comments to RESOLVED with the resolver id", async () => {
    prismaMock.websiteReviewComment.updateMany.mockResolvedValue({ count: 2 });

    await markResolved(["c1", "c2"], "admin1");

    expect(prismaMock.websiteReviewComment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["c1", "c2"] } },
      data: expect.objectContaining({ status: "RESOLVED", resolvedById: "admin1" }),
    });
  });

  it("accepts null resolvedById (system/auto resolution)", async () => {
    prismaMock.websiteReviewComment.updateMany.mockResolvedValue({ count: 1 });
    await markResolved(["c1"], null);
    expect(prismaMock.websiteReviewComment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ resolvedById: null }) }),
    );
  });
});
