import { NextResponse } from "next/server";
import { getSiteToken, resolveSite } from "@/lib/auth/site-token";
import { createLead, leadInputSchema } from "@/lib/modules/lead";
import "@/lib/events/subscribers"; // register lead.created handlers

export const runtime = "nodejs"; // Prisma requires the Node runtime
export const dynamic = "force-dynamic";

// Public endpoint — called cross-origin by generated client sites (incl. sandboxed
// null-origin iframes), so it advertises CORS.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: CORS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * POST /api/v1/public/leads
 * Auth: site token (Bearer or x-site-token) → resolves the tenant.
 * Body: { type?, name, email, phone?, message?, source? }
 */
export async function POST(req: Request) {
  const site = await resolveSite(getSiteToken(req));
  if (!site) {
    return json({ error: "unauthorized" }, 401);
  }

  const body = await req.json().catch(() => null);
  const parsed = leadInputSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "validation_error", issues: parsed.error.flatten() }, 400);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  try {
    const lead = await createLead({ clientId: site.clientId, input: parsed.data, ip });
    return json({ id: lead.id, status: lead.status, createdAt: lead.createdAt }, 201);
  } catch (err) {
    console.error("[POST /api/v1/public/leads]", err);
    return json({ error: "internal_error" }, 500);
  }
}
