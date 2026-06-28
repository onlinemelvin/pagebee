import { prisma } from "@/lib/db";
import { getPreviewSiteForClient } from "@/lib/modules/website";
import { serveTenant } from "@/lib/site/serve";
import { appBase } from "@/lib/modules/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOINDEX = { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" };

function generatingPage(): Response {
  return new Response(
    `<!doctype html><html><head><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1">
     <title>Your preview is being built</title>
     <style>body{font-family:ui-sans-serif,system-ui;background:#fdfbf5;color:#1c1917;display:grid;place-items:center;height:100vh;margin:0;text-align:center}
     .b{max-width:28rem;padding:2rem}h1{font-size:1.5rem}p{color:#78716c}.d{display:inline-block;width:.5rem;height:.5rem;border-radius:9999px;background:#f5a623;margin:0 2px;animation:p 1s infinite}.d:nth-child(2){animation-delay:.15s}.d:nth-child(3){animation-delay:.3s}@keyframes p{0%,100%{opacity:.3}50%{opacity:1}}</style>
     <meta http-equiv="refresh" content="6"></head>
     <body><div class="b"><h1>🐝 Building your website preview</h1><p>This usually takes under a minute. The page will refresh automatically.</p>
     <div><span class="d"></span><span class="d"></span><span class="d"></span></div></div></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", ...NOINDEX } },
  );
}

/**
 * GET /p/{token} — public, unauthenticated preview viewer. A rep shares this link with a prospect
 * before any account exists; the token is an unguessable capability key. noindex + no-store; serves
 * the generated site in preview mode (banner). Records first view.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const preview = await prisma.preview.findUnique({
    where: { publicToken: token },
    select: { id: true, clientId: true, status: true, viewedAt: true, setupDiscountPct: true, monthlyDiscountPct: true },
  });
  if (!preview?.clientId) {
    return new Response("Preview not found.", { status: 404, headers: NOINDEX });
  }

  // Record first view (fail-soft; never block serving).
  if (!preview.viewedAt) {
    await prisma.preview
      .update({
        where: { id: preview.id },
        data: {
          viewedAt: new Date(),
          ...(preview.status === "PREVIEW_SENT" || preview.status === "PREVIEW_READY" ? { status: "PREVIEW_VIEWED" } : {}),
        },
      })
      .catch(() => {});
  }

  const site = await getPreviewSiteForClient(preview.clientId);
  if (!site || !site.html) return generatingPage();

  // The agreed price for this preview's plan: the provisional subscription carries the list fees;
  // the rep's setup-fee discount (if any) is applied here so it reflects without touching the sub.
  const sub = await prisma.subscription.findUnique({
    where: { clientId: preview.clientId },
    select: { agreedSetupFee: true, agreedMonthlyFee: true },
  });
  const monthlyPct = preview.monthlyDiscountPct ?? 0;
  const price = sub
    ? {
        setupCents: sub.agreedSetupFee,
        setupAfterDiscountCents: Math.round(sub.agreedSetupFee * (1 - (preview.setupDiscountPct ?? 0) / 100)),
        monthlyCents: sub.agreedMonthlyFee,
        monthlyAfterDiscountCents: Math.round(sub.agreedMonthlyFee * (1 - monthlyPct / 100)),
        promoMonths: monthlyPct > 0 ? 12 : 0,
      }
    : undefined;

  // The "Ready to launch" footer CTA starts signup with THIS preview attached — the prospect's new
  // account adopts the provisional client behind the token (no separate site/account to reconcile).
  const launchUrl = `${appBase()}/register?previewToken=${encodeURIComponent(token)}`;
  const res = serveTenant(site, req, undefined, { launchUrl, price });
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}
