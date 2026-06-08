import { NextResponse } from "next/server";
import { getSiteToken, resolveSite } from "@/lib/auth/site-token";
import { createLead, leadInputSchema } from "@/lib/modules/lead";
import "@/lib/events/subscribers"; // register lead.created handlers

export const runtime = "nodejs"; // Prisma requires the Node runtime
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/public/leads
 * Auth: site token (Bearer or x-site-token) → resolves the tenant.
 * Body: { type?, name, email, phone?, message?, source? }
 */
export async function POST(req: Request) {
  const site = await resolveSite(getSiteToken(req));
  if (!site) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = leadInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  try {
    const lead = await createLead({ clientId: site.clientId, input: parsed.data, ip });
    return NextResponse.json(
      { id: lead.id, status: lead.status, createdAt: lead.createdAt },
      { status: 201 },
    );
  } catch (err) {
    console.error("[POST /api/v1/public/leads]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
