import { redirect } from "next/navigation";
import { getClientWorkspace } from "@/lib/modules/client";
import { ClientNav } from "@/components/client/ClientNav";
import { SignOutButton } from "@/components/admin/SignOutButton";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const ws = await getClientWorkspace();
  if (!ws) redirect("/login");

  return (
    <div className="grid min-h-screen grid-cols-1 bg-stone-50 sm:grid-cols-[240px_1fr]">
      <aside className="flex flex-col border-b border-stone-200 bg-white px-4 py-4 sm:border-b-0 sm:border-r sm:py-6">
        <div className="mb-2 flex items-center gap-2 px-2 sm:mb-6">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-400 text-lg">🐝</span>
          <div className="leading-tight">
            <p className="max-w-[150px] truncate font-display text-sm font-semibold text-stone-900">
              {ws.client.businessName}
            </p>
            <p className="text-xs text-stone-400">{ws.planName} plan</p>
          </div>
        </div>
        <ClientNav tabs={ws.tabs} />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex h-16 items-center justify-end gap-4 border-b border-stone-200 bg-white px-6">
          <span className="hidden text-sm text-stone-500 sm:inline">{ws.email}</span>
          <SignOutButton />
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 p-6 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
