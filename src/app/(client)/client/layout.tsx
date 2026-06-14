import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, ExternalLink, Eye, Wand2 } from "lucide-react";
import { getClientWorkspace } from "@/lib/modules/client";
import { planByName } from "@/lib/plans";
import { ClientNav } from "@/components/client/ClientNav";
import { Topbar } from "@/components/client/Topbar";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const ws = await getClientWorkspace();
  if (!ws) redirect("/login");

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
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-400 text-lg shadow-sm">🐝</span>
          <div className="leading-tight">
            <p className="max-w-[150px] truncate font-display text-sm font-semibold text-stone-900">{ws.client.businessName}</p>
            <p className="text-xs text-stone-400">{ws.planName} plan</p>
          </div>
        </div>

        {cta && (
          <Link
            href={cta.href}
            {...(ctaExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="mb-5 flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-800"
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
        <Topbar
          email={ws.email}
          businessName={ws.client.businessName}
          planName={ws.planName}
          tabs={ws.tabs}
          actions={ws.actions}
          isOwner={isOwner}
        />
        <main className="mx-auto w-full max-w-[1400px] flex-1 p-5 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
