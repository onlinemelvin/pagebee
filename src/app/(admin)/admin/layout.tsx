import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getAuthContext, hasPermission } from "@/lib/auth/session";
import { SignOutButton } from "@/components/admin/SignOutButton";
import { AdminNav, type AdminTab } from "@/components/admin/AdminNav";
import { LogoMark, Wordmark } from "@/components/brand/Logo";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  // Admins get everything; a reviewer/contractor (website:review) gets in but only sees Websites.
  const canReview = ctx ? hasPermission(ctx, "website:review") : false;
  if (!ctx || (!ctx.isAdmin && !canReview)) redirect("/login");

  const tabs: AdminTab[] = [];
  if (ctx.isAdmin) {
    tabs.push(
      { key: "overview", label: "Overview", href: "/admin" },
      { key: "leads", label: "Leads", href: "/admin/leads" },
      { key: "upgrades", label: "Upgrades", href: "/admin/upgrade-requests" },
      { key: "analytics", label: "Analytics", href: "/admin/analytics" },
      { key: "email", label: "Email", href: "/admin/email" },
    );
  }
  tabs.push({ key: "websites", label: "Websites", href: "/admin/websites" });

  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr] bg-stone-50">
      <aside className="sticky top-0 flex h-screen flex-col overflow-y-auto border-r border-stone-200 bg-white px-4 py-6">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <LogoMark size={36} />
          <div className="leading-tight">
            <Wordmark className="text-lg" />
            <p className="text-xs text-stone-400">{ctx.isAdmin ? "Admin console" : "Reviewer"}</p>
          </div>
        </div>

        <AdminNav tabs={tabs} />

        <div className="mt-auto rounded-2xl border border-stone-200 bg-stone-50 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-stone-600">
            <ShieldCheck size={13} className="text-emerald-500" /> {ctx.isAdmin ? "Administrator" : "Website reviewer"}
          </p>
          <p className="mt-1 truncate text-xs text-stone-400">{ctx.email}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-stone-200 bg-white/85 px-8 backdrop-blur-md">
          <span className="text-sm font-medium text-stone-400">Internal · PageBee Ops</span>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-stone-600 sm:inline">{ctx.email}</span>
            <SignOutButton />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1280px] flex-1 p-6 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
