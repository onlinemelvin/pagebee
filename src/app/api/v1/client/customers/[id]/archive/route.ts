import { NextResponse } from "next/server";
import { requireClient, AuthError } from "@/lib/auth/session";
import { setCustomerArchived, CustomerError } from "@/lib/modules/customer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/client/customers/{id}/archive  body { archived: boolean } — soft hide / restore. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { ctx, client } = await requireClient();
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as { archived?: boolean } | null;
    const archived = body?.archived !== false; // default to archiving
    const customer = await setCustomerArchived(client.id, id, archived, { userId: ctx.userId });
    return NextResponse.json({ customer });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof CustomerError) return NextResponse.json({ error: err.code }, { status: err.status });
    throw err;
  }
}
