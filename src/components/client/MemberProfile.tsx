"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { User, Mail, LogOut, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/** A staff member's personal account page: edit their display name, see their email, and sign out.
 *  (Account-level controls like notifications & billing stay owner-only.) */
export function MemberProfile({ initialName, email, businessName }: { initialName: string; email: string; businessName: string }) {
  const router = useRouter();
  const [name, setName] = React.useState(initialName);
  const [saved, setSaved] = React.useState(initialName);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState(false);

  const dirty = name.trim() !== saved.trim();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty || !name.trim()) return;
    setBusy(true);
    setError(null);
    setOk(false);
    try {
      const res = await fetch("/api/v1/client/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error("failed");
      setSaved(name.trim());
      setOk(true);
      router.refresh(); // updates the dashboard greeting
    } catch {
      setError("Couldn't save — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const inputCls =
    "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-100 disabled:bg-stone-50";

  return (
    <div className="space-y-6">
      <form onSubmit={save} className="rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
        <p className="flex items-center gap-2 font-display text-lg text-stone-900"><User size={18} className="text-amber-500" /> Your profile</p>
        <p className="mt-1 text-sm text-stone-500">You&apos;re a team member of <span className="font-medium text-stone-700">{businessName}</span>.</p>

        <label className="mt-4 grid gap-1 text-sm font-medium text-stone-700">
          Your name
          <input value={name} onChange={(e) => { setName(e.target.value); setOk(false); }} disabled={busy} placeholder="Your name" className={inputCls} />
        </label>

        <label className="mt-3 grid gap-1 text-sm font-medium text-stone-700">
          Email
          <span className="relative">
            <Mail size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input value={email} readOnly className={`${inputCls} pl-9 text-stone-500`} />
          </span>
          <span className="text-xs text-stone-400">Your email can&apos;t be changed here. Ask the owner if you need to switch accounts.</span>
        </label>

        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        <div className="mt-4 flex items-center gap-3">
          <Button type="submit" disabled={busy || !dirty}>{busy ? "Saving…" : "Save changes"}</Button>
          {ok && !dirty && <span className="flex items-center gap-1 text-sm text-green-700"><Check size={15} /> Saved</span>}
        </div>
      </form>

      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
        <p className="font-display text-lg text-stone-900">Sign out</p>
        <p className="mt-1 text-sm text-stone-500">Sign out of PageBee on this device.</p>
        <Button variant="ghost" className="mt-3" onClick={signOut}><LogOut size={15} /> Sign out</Button>
      </div>
    </div>
  );
}
