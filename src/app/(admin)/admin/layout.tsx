import { redirect } from "next/navigation";
import Link from "next/link";
import { Inbox, LayoutDashboard, Globe } from "lucide-react";
import { getAuthContext } from "@/lib/auth/session";
import { SignOutButton } from "@/components/admin/SignOutButton";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx?.isAdmin) redirect("/login");

  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr] bg-stone-50">
      <aside className="flex flex-col border-r border-stone-200 bg-white px-4 py-6">
        <div className="mb-8 flex items-center gap-2 px-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-400 text-lg">🐝</span>
          <span className="font-display text-lg font-semibold text-stone-900">PageBee</span>
        </div>
        <nav className="flex flex-col gap-1 text-sm">
          <Link href="/admin" className="flex items-center gap-3 rounded-lg px-3 py-2 text-stone-600 hover:bg-stone-100">
            <LayoutDashboard size={18} /> Overview
          </Link>
          <Link href="/admin/leads" className="flex items-center gap-3 rounded-lg px-3 py-2 text-stone-700 hover:bg-stone-100">
            <Inbox size={18} /> Leads
          </Link>
          <Link href="/admin/websites" className="flex items-center gap-3 rounded-lg px-3 py-2 text-stone-700 hover:bg-stone-100">
            <Globe size={18} /> Websites
          </Link>
        </nav>
      </aside>

      <div className="flex flex-col">
        <header className="flex h-16 items-center justify-between border-b border-stone-200 bg-white px-8">
          <span className="text-sm font-medium text-stone-500">Admin</span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-stone-600">{ctx.email}</span>
            <SignOutButton />
          </div>
        </header>
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
