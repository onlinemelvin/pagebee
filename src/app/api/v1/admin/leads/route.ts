import { NextResponse } from "next/server";
import type { LeadStatus } from "@prisma/client";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { listLeads, LEAD_STATUSES } from "@/lib/modules/lead";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/admin/leads?status=NEW — list leads across all tenants (admin only). */
export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const statusParam = new URL(req.url).searchParams.get("status");
  const status =
    statusParam && (LEAD_STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as LeadStatus)
      : undefined;

  const leads = await listLeads({ status });
  return NextResponse.json({ leads });
}
