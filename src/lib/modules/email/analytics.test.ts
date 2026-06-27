import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/test/setup";

import { emailOverview, emailByCategory, listEmailLogs } from "./analytics";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("emailOverview", () => {
  it("aggregates counts and computes rates correctly", async () => {
    // Mock 6 prisma.emailLog.count calls in order: total, sent, delivered, opened, bounced, failed
    prismaMock.emailLog.count
      .mockResolvedValueOnce(100)  // total
      .mockResolvedValueOnce(80)   // sent
      .mockResolvedValueOnce(60)   // delivered
      .mockResolvedValueOnce(20)   // opened
      .mockResolvedValueOnce(5)    // bounced
      .mockResolvedValueOnce(10);  // failed

    const result = await emailOverview(30);

    expect(result.total).toBe(100);
    expect(result.sent).toBe(80);
    expect(result.delivered).toBe(60);
    expect(result.opened).toBe(20);
    expect(result.bounced).toBe(5);
    expect(result.failed).toBe(10);
    // deliveryRate = round(60/80 * 1000)/10 = 75
    expect(result.deliveryRate).toBe(75);
    // openRate = round(20/60 * 1000)/10 = 33.3
    expect(result.openRate).toBe(33.3);
    // bounceRate = round(5/80 * 1000)/10 = 6.3
    expect(result.bounceRate).toBe(6.3);
  });

  it("returns zero rates when denominators are zero", async () => {
    prismaMock.emailLog.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const result = await emailOverview();
    expect(result.deliveryRate).toBe(0);
    expect(result.openRate).toBe(0);
    expect(result.bounceRate).toBe(0);
  });
});

describe("emailByCategory", () => {
  it("merges sent counts with opened counts by category and sorts descending", async () => {
    prismaMock.emailLog.groupBy
      .mockResolvedValueOnce([
        { category: "BILLING", _count: { _all: 50 } },
        { category: "WELCOME", _count: { _all: 10 } },
      ] as never)
      .mockResolvedValueOnce([
        { category: "BILLING", _count: { _all: 15 } },
      ] as never);

    const result = await emailByCategory();
    expect(result[0]).toEqual({ category: "BILLING", sent: 50, opened: 15 });
    expect(result[1]).toEqual({ category: "WELCOME", sent: 10, opened: 0 });
  });
});

describe("listEmailLogs", () => {
  it("paginates: returns rows up to take and sets nextCursor when there are more", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({ id: `id${i}` }));
    prismaMock.emailLog.findMany.mockResolvedValue(rows as never);

    const result = await listEmailLogs({ take: 50 });
    expect(result.rows).toHaveLength(50);
    expect(result.nextCursor).toBe("id50");
  });

  it("returns null nextCursor when fewer rows than take", async () => {
    prismaMock.emailLog.findMany.mockResolvedValue([{ id: "a" }] as never);
    const result = await listEmailLogs({ take: 50 });
    expect(result.nextCursor).toBeNull();
  });

  it("applies status filter when provided", async () => {
    prismaMock.emailLog.findMany.mockResolvedValue([]);
    await listEmailLogs({ status: "FAILED" as never });
    expect(prismaMock.emailLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "FAILED" }) }),
    );
  });

  it("applies category filter when provided", async () => {
    prismaMock.emailLog.findMany.mockResolvedValue([]);
    await listEmailLogs({ category: "BILLING" as never });
    expect(prismaMock.emailLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ category: "BILLING" }) }),
    );
  });

  it("adds OR search clause when search is provided", async () => {
    prismaMock.emailLog.findMany.mockResolvedValue([]);
    await listEmailLogs({ search: "test@example.com" });
    expect(prismaMock.emailLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ OR: expect.any(Array) }),
      }),
    );
  });

  it("caps take at 200", async () => {
    prismaMock.emailLog.findMany.mockResolvedValue([]);
    await listEmailLogs({ take: 999 });
    expect(prismaMock.emailLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 201 }), // take + 1 = 200 + 1
    );
  });

  it("uses cursor when provided", async () => {
    prismaMock.emailLog.findMany.mockResolvedValue([]);
    await listEmailLogs({ cursor: "cursor-id" });
    expect(prismaMock.emailLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: "cursor-id" }, skip: 1 }),
    );
  });
});
