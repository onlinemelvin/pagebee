import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, FileSignature } from "lucide-react";
import { getRepWorkspace, listFollowUps } from "@/lib/modules/sales";
import { SignOutButton } from "@/components/admin/SignOutButton";
import { RepNav } from "@/components/rep/RepNav";
import { LogoMark, Wordmark } from "@/components/brand/Logo";

export const dynamic = "force-dynamic";

export default async function RepLayout({ children }: { children: React.ReactNode }) {
  const ws = await getRepWorkspace();
  if (!ws) redirect("/login");

  // Badge the Follow-ups tab with the count of open follow-ups (cheap; rep-scoped).
  const openFollowUps = await listFollowUps(ws.employee.id);

  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr] bg-stone-50">
      <aside className="sticky top-0 flex h-screen flex-col overflow-y-auto border-r border-stone-200 bg-white px-4 py-6">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <LogoMark size={36} />
          <div className="leading-tight">
            <Wordmark className="text-lg" />
            <p className="text-xs text-stone-400">Sales portal</p>
          </div>
        </div>

        <RepNav followUpBadge={openFollowUps.length || undefined} />

        <div className="mt-auto space-y-2">
          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-stone-600">
              <BadgeCheck size={13} className={ws.certified ? "text-emerald-500" : "text-stone-300"} />
              {ws.certified ? "Certified rep" : "Not yet certified"}
            </p>
            <p className="mt-1 truncate text-xs text-stone-400">{ws.email}</p>
            <Link
              href="/rep/contract"
              className="mt-2 flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-800"
            >
              <FileSignature size={12} /> {ws.hasActiveContract ? "My agreement" : "Sign agreement"}
            </Link>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-stone-200 bg-white/85 px-8 backdrop-blur-md">
          <span className="text-sm font-medium text-stone-400">PageBee · Sales rep</span>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-stone-600 sm:inline">{ws.email}</span>
            <SignOutButton />
          </div>
        </header>

        {!ws.hasActiveContract ? (
          <Link
            href="/rep/contract"
            className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-8 py-3 text-sm text-amber-800 hover:bg-amber-100"
          >
            <FileSignature size={16} />
            <span>
              Your commission agreement isn&apos;t active yet. You can explore the portal, but adding prospects and
              selling unlock once your contract is signed. <span className="font-semibold underline">Review &amp; sign →</span>
            </span>
          </Link>
        ) : null}

        <main className="mx-auto w-full max-w-[1280px] flex-1 p-6 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
