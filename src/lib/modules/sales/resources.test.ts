import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

vi.mock("@/lib/modules/audit", () => ({ writeAudit: vi.fn() }));

import { listRepResources, createRepResource, deleteRepResource } from "./resources";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listRepResources", () => {
  it("groups docs by the rep: category suffix, sorted", async () => {
    prismaMock.internalDocument.findMany.mockResolvedValue([
      { id: "d1", title: "Pitch deck", url: "https://x/1", category: "rep:Pitch", createdAt: new Date() },
      { id: "d2", title: "Demo video", url: "https://x/2", category: "rep:Product 101", createdAt: new Date() },
      { id: "d3", title: "Cold script", url: "https://x/3", category: "rep:Pitch", createdAt: new Date() },
    ]);
    const groups = await listRepResources();
    expect(groups.map((g) => g.group)).toEqual(["Pitch", "Product 101"]);
    expect(groups[0].items.map((i) => i.title)).toEqual(["Cold script", "Pitch deck"]); // sorted
    expect(prismaMock.internalDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { category: { startsWith: "rep:" } } }),
    );
  });
});

describe("createRepResource", () => {
  it("stores the resource with the rep: prefix", async () => {
    prismaMock.internalDocument.create.mockResolvedValue({ id: "d1" });
    await createRepResource({ title: "Pitch deck", url: "https://x/1", group: "Pitch" }, { userId: "a1" });
    expect(prismaMock.internalDocument.create).toHaveBeenCalledWith({
      data: { title: "Pitch deck", url: "https://x/1", category: "rep:Pitch" },
    });
  });

  it("rejects an invalid URL", async () => {
    await expect(createRepResource({ title: "X", url: "not-a-url", group: "G" })).rejects.toBeTruthy();
  });
});

describe("deleteRepResource", () => {
  it("deletes a rep resource", async () => {
    prismaMock.internalDocument.findUnique.mockResolvedValue({ id: "d1", category: "rep:Pitch" });
    prismaMock.internalDocument.delete.mockResolvedValue({});
    await expect(deleteRepResource("d1")).resolves.toEqual({ ok: true });
  });

  it("refuses to delete a non-rep internal document", async () => {
    prismaMock.internalDocument.findUnique.mockResolvedValue({ id: "d1", category: "legal" });
    await expect(deleteRepResource("d1")).rejects.toMatchObject({ code: "resource_not_found", status: 404 });
    expect(prismaMock.internalDocument.delete).not.toHaveBeenCalled();
  });
});
