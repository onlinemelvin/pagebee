import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, ExternalLink, Eye, Wand2 } from "lucide-react";
import { getClientWorkspace } from "@/lib/modules/client";
import { getCurrentClient } from "@/lib/auth/session";
import { accountAccess } from "@/lib/auth/policy";
import { planByName } from "@/lib/plans";
import { ClientNav } from "@/components/client/ClientNav";
import { Topbar } from "@/components/client/Topbar";
import { LogoMark } from "@/components/brand/Logo";
import { Honeycomb } from "@/components/client/ui/Honeycomb";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const ws = await getClientWorkspace();
  if (!ws) redirect("/login");

  // Account-status gate (read side; mutations are blocked server-side by requireClient/requireOwner).
  // Suspended/cancelled tenants are bounced to billing — the one place they can reactivate. Past-due
  // tenants keep working but see a warning banner. Mirrors src/lib/auth/policy.ts (single source).
  const current = await getCurrentClient();
  const access = current ? accountAccess(current.client) : { ok: true, warn: false, reason: null };
  const pathname = (await headers()).get("x-pathname") ?? "";
  // Require a known pathname before redirecting, so a missing header can't loop on /client/billing.
  // (Mutations stay blocked by the API guard regardless of this read-side redirect.)
  if (!access.ok && pathname && !pathname.startsWith("/client/billing")) redirect("/client/billing");

  const isOwner = ws.role === "owner";

  // Contextual primary CTA in the sidebar. Staff see view-only (no create/manage).
  const cta = isOwner
    ? !ws.website.exists
      ? { label: "Create your site", href: "/client/website", icon: Wand2 }
      : ws.preview.live && ws.preview.url
        ? { label: "View live site", href: ws.preview.url, icon: ExternalLink }
        : ws.preview.viewable || ws.preview.ready
          ? { label: "View preview", href: ws.preview.url ?? "/preview", icon: Eye }
          : { label: "Your website", href: "/client/website", icon: Wand2 }
    : ws.preview.live && ws.preview.url
      ? { label: "View live site", href: ws.preview.url, icon: ExternalLink }
      : null;
  const ctaExternal = cta?.href.startsWith("http") ?? false;

  const secondaryTabs = [
    ...(ws.caps.teamSeats > 1 ? [{ key: "team", label: "Team", href: "/client/team" }] : []),
    ...(isOwner ? [{ key: "billing", label: "Billing", href: "/client/billing" }] : []),
  ];

  const pct = ws.quota.allowance > 0 ? Math.min(100, Math.round((ws.quota.used / ws.quota.allowance) * 100)) : 0;
  const unlimitedUpdates = planByName(ws.planName)?.quotas.updatesUnlimited === true;

  return (
    <div className="grid min-h-screen grid-cols-1 bg-stone-50 sm:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col overflow-y-auto border-r border-stone-200 bg-white px-4 py-6 sm:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <LogoMark size={36} />
          <div className="leading-tight">
            <p className="max-w-[150px] truncate font-display text-sm font-semibold text-stone-900">{ws.client.businessName}</p>
            <p className="text-xs text-stone-400">{ws.planName} plan</p>
          </div>
        </div>

        {cta && (
          <Link
            href={cta.href}
            {...(ctaExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="mb-5 flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-stone-900 shadow-sm transition hover:bg-amber-300"
          >
            <cta.icon size={16} /> {cta.label}
          </Link>
        )}

        <ClientNav tabs={ws.tabs} />

        {secondaryTabs.length > 0 && (
          <div className="mt-3 border-t border-stone-100 pt-3">
            <ClientNav tabs={secondaryTabs} />
          </div>
        )}

        {/* Quota / upgrade nudge (owner only) */}
        <div className="mt-auto">
          {isOwner && ws.quota.allowance > 0 && (
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-stone-700">Monthly updates</span>
                <span className="text-stone-500">{unlimitedUpdates ? "Unlimited" : `${ws.quota.remaining} left`}</span>
              </div>
              {!unlimitedUpdates && (
                <>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
                    <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <Link href="/client/billing" className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-800">
                    <ArrowUpRight size={13} /> Need more? Upgrade
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Shared backdrop for every client page: soft colour blobs + honeycomb texture. Fixed to the
            content column (right of the sidebar, below the topbar), isolated onto its own GPU layer
            (transform-gpu + contain: paint) so it rasterizes once and only composites. */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 bottom-0 top-16 transform-gpu overflow-hidden sm:left-[248px]"
          style={{ contain: "paint", backfaceVisibility: "hidden" }}
        >
          <div
            className="absolute -left-40 -top-40 h-[48rem] w-[48rem] rounded-full"
            style={{ background: "radial-gradient(circle, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0) 70%)" }}
          />
          <div
            className="absolute right-[-12rem] top-1/4 h-[42rem] w-[42rem] rounded-full"
            style={{ background: "radial-gradient(circle, rgba(253,186,116,0.03) 0%, rgba(253,186,116,0) 70%)" }}
          />
          <div
            className="absolute bottom-[-16rem] left-1/3 h-[44rem] w-[44rem] rounded-full"
            style={{ background: "radial-gradient(circle, rgba(254,205,211,0.03) 0%, rgba(254,205,211,0) 70%)" }}
          />
          <Honeycomb filled opacity={0.04} />
        </div>
        <Topbar
          email={ws.email}
          businessName={ws.client.businessName}
          planName={ws.planName}
          tabs={ws.tabs}
          actions={ws.actions}
          isOwner={isOwner}
          testMode={ws.testMode}
          testModeEligible={ws.testModeEligible}
        />
        <main className="relative z-10 mx-auto w-full max-w-[1400px] flex-1 p-5 sm:p-8">
          {access.warn && (
            <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-sm">
              <AlertTriangle size={18} className="shrink-0 text-amber-600" />
              <p className="min-w-0 flex-1 text-sm text-amber-900">
                Your last payment didn&apos;t go through. Update your payment method to keep your site and features
                running without interruption.
              </p>
              <Link href="/client/billing" className="shrink-0 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600">
                Fix billing
              </Link>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
