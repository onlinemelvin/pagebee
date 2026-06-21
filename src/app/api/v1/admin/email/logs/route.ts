import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { listEmailLogs } from "@/lib/modules/email";
import type { DeliveryStatus, EmailCategory } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["QUEUED", "SENT", "DELIVERED", "BOUNCED", "FAILED", "OPENED"];
const CATEGORIES = ["WELCOME", "AUTH", "BILLING", "WEBSITE", "USAGE", "ACCOUNT", "TIPS", "ANNOUNCEMENT", "PROMOTION"];

/** GET /api/v1/admin/email/logs — paginated, filterable email log feed. */
export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const sp = new URL(req.url).searchParams;
  const status = sp.get("status");
  const category = sp.get("category");
  const result = await listEmailLogs({
    status: status && STATUSES.includes(status) ? (status as DeliveryStatus) : undefined,
    category: category && CATEGORIES.includes(category) ? (category as EmailCategory) : undefined,
    campaignId: sp.get("campaignId") ?? undefined,
    search: sp.get("search") ?? undefined,
    cursor: sp.get("cursor") ?? undefined,
  });
  return NextResponse.json(result);
}
