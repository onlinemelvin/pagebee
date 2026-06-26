import { NextResponse } from "next/server";
import { declineInviteByToken } from "@/lib/modules/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function token(req: Request): string | null {
  return new URL(req.url).searchParams.get("token");
}

/** A tiny standalone confirmation page for when a human clicks the footer "Decline" link. */
function confirmationPage(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Invitation declined</title></head>
<body style="margin:0;background:#f4f2ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:460px;margin:64px auto;padding:0 16px;text-align:center">
    <p style="font-size:21px;font-weight:800;letter-spacing:-0.02em"><span style="color:#1c1917">Page</span><span style="color:#f59e0b">Bee</span></p>
    <div style="background:#fff;border:1px solid #ececea;border-radius:18px;padding:32px 28px;margin-top:18px">
      <h1 style="margin:0 0 8px;font-size:18px;color:#1c1917">Invitation declined</h1>
      <p style="margin:0;color:#44403c;font-size:14px;line-height:1.6">You won't receive any more emails about this invitation. If this was a mistake, ask the sender to invite you again.</p>
    </div>
  </div>
</body></html>`;
}

/**
 * GET /api/v1/public/invite/decline?token= — the visible "Decline this invitation" footer link.
 * Declines the invite and shows a confirmation page. No session (it's a one-click email link).
 */
export async function GET(req: Request) {
  const t = token(req);
  if (t) await declineInviteByToken(t);
  return new NextResponse(confirmationPage(), { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

/**
 * POST /api/v1/public/invite/decline?token= — the RFC 8058 one-click List-Unsubscribe target.
 * Mail clients POST here directly, so it must succeed without a session or CSRF token. Idempotent.
 */
export async function POST(req: Request) {
  const t = token(req);
  if (!t) return NextResponse.json({ error: "missing_token" }, { status: 400 });
  await declineInviteByToken(t);
  return NextResponse.json({ ok: true });
}
