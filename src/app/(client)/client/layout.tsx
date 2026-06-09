import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentClient } from "@/lib/auth/session";
import { SignOutButton } from "@/components/admin/SignOutButton";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const result = await getCurrentClient();
  if (!result) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col bg-stone-50">
      <header className="flex h-16 items-center justify-between border-b border-stone-200 bg-white px-6 sm:px-8">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-400 text-lg">🐝</span>
          <span className="font-display text-lg font-semibold text-stone-900">{result.client.businessName}</span>
        </div>
        <div className="flex items-center gap-4">
          <nav className="hidden items-center gap-6 text-sm font-medium text-stone-600 sm:flex">
            <Link href="/client" className="hover:text-stone-900">Overview</Link>
            <Link href="/client/website" className="hover:text-stone-900">Website</Link>
          </nav>
          <span className="hidden text-sm text-stone-500 sm:inline">{result.ctx.email}</span>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 p-6 sm:p-8">{children}</main>
    </div>
  );
}
