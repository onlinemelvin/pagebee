import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

/**
 * Generation observability for the admin Analytics tab: volume, success rate, how long generations
 * take, and — specifically — how many were cut off by the Supabase edge function's execution-time
 * limit. An edge timeout leaves a job in GENERATING with a built prompt but no result (the edge was
 * killed before it could write `llmResult` or mark the job FAILED), so "stuck" offloaded jobs are
 * the edge-timeout signal. All metrics are scoped to a rolling window (default 30 days).
 */

// A job offloaded to the edge that never came back: prompt built, no result, GENERATING past this
// cutoff → almost certainly killed by the 150s edge wall-clock (or an edge crash).
const STUCK_AFTER_MS = 4 * 60 * 1000;

export interface GenDuration {
  count: number;
  avgSec: number;
  p50Sec: number;
  p95Sec: number;
  maxSec: number;
}

export interface GenAnalytics {
  windowDays: number;
  total: number;
  completed: number; // reached NEEDS_REVIEW
  failed: number; // FAILED
  inFlight: number; // QUEUED/GENERATING and NOT stuck
  stuck: number; // offloaded, no result, GENERATING past the cutoff → likely edge timeout
  successRatePct: number | null; // completed / (completed + failed + stuck)
  offloadCount: number; // used the edge offload (llmPrompt set)
  duration: GenDuration | null; // start→finish for completed jobs
  topErrors: { error: string; count: number }[];
  daily: { date: string; completed: number; failed: number }[];
  recentFailures: { id: string; business: string | null; error: string | null; createdAt: Date }[];
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export async function getGenerationAnalytics(windowDays = 30): Promise<GenAnalytics> {
  const since = new Date(Date.now() - windowDays * 86_400_000);
  const stuckCutoff = new Date(Date.now() - STUCK_AFTER_MS);

  const [byStatus, stuck, offloadCount, durationRows, errorGroups, dailyRows, recent] = await Promise.all([
    prisma.websiteGenerationJob.groupBy({
      by: ["status"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.websiteGenerationJob.count({
      where: {
        createdAt: { gte: since },
        status: "GENERATING",
        llmPrompt: { not: Prisma.DbNull },
        llmResult: null,
        startedAt: { lt: stuckCutoff },
      },
    }),
    prisma.websiteGenerationJob.count({
      where: { createdAt: { gte: since }, llmPrompt: { not: Prisma.JsonNull } },
    }),
    // start→finish seconds for completed jobs (newest 1000), computed in Postgres.
    prisma.$queryRaw<{ secs: number }[]>`
      SELECT EXTRACT(EPOCH FROM ("finishedAt" - "startedAt"))::float AS secs
      FROM website_generation_jobs
      WHERE status = 'NEEDS_REVIEW' AND "finishedAt" IS NOT NULL AND "startedAt" IS NOT NULL
        AND "createdAt" >= ${since}
      ORDER BY "createdAt" DESC
      LIMIT 1000`,
    prisma.websiteGenerationJob.groupBy({
      by: ["error"],
      where: { createdAt: { gte: since }, status: "FAILED", error: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { error: "desc" } },
      take: 6,
    }),
    prisma.websiteGenerationJob.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true, status: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    }),
    prisma.websiteGenerationJob.findMany({
      where: { createdAt: { gte: since }, status: "FAILED" },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        error: true,
        createdAt: true,
        website: { select: { client: { select: { businessName: true } } } },
      },
    }),
  ]);

  const countFor = (s: string) => byStatus.find((r) => r.status === s)?._count._all ?? 0;
  const total = byStatus.reduce((n, r) => n + r._count._all, 0);
  const completed = countFor("NEEDS_REVIEW");
  const failed = countFor("FAILED");
  const inFlightRaw = countFor("QUEUED") + countFor("GENERATING");
  const inFlight = Math.max(0, inFlightRaw - stuck);

  const denom = completed + failed + stuck;
  const successRatePct = denom > 0 ? Math.round((completed / denom) * 100) : null;

  const secs = durationRows.map((r) => Number(r.secs)).filter((n) => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
  const duration: GenDuration | null = secs.length
    ? {
        count: secs.length,
        avgSec: Math.round(secs.reduce((a, b) => a + b, 0) / secs.length),
        p50Sec: Math.round(percentile(secs, 50)),
        p95Sec: Math.round(percentile(secs, 95)),
        maxSec: Math.round(secs[secs.length - 1]),
      }
    : null;

  const topErrors = errorGroups.map((g) => ({ error: g.error ?? "(unknown)", count: g._count._all }));

  // Bucket the last 14 days by date (UTC) → completed / failed counts.
  const days = Math.min(windowDays, 14);
  const buckets = new Map<string, { completed: number; failed: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    buckets.set(d, { completed: 0, failed: 0 });
  }
  for (const row of dailyRows) {
    const d = row.createdAt.toISOString().slice(0, 10);
    const b = buckets.get(d);
    if (!b) continue;
    if (row.status === "NEEDS_REVIEW") b.completed++;
    else if (row.status === "FAILED") b.failed++;
  }
  const daily = [...buckets.entries()].map(([date, v]) => ({ date, ...v }));

  const recentFailures = recent.map((r) => ({
    id: r.id,
    business: r.website?.client?.businessName ?? null,
    error: r.error,
    createdAt: r.createdAt,
  }));

  return {
    windowDays,
    total,
    completed,
    failed,
    inFlight,
    stuck,
    successRatePct,
    offloadCount,
    duration,
    topErrors,
    daily,
    recentFailures,
  };
}
