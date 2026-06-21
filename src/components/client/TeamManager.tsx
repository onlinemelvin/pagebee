"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Mail, Trash2, Clock, Crown, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TeamState } from "@/lib/modules/team";

const ERR: Record<string, string> = {
  seat_limit_reached: "You've used all your seats. Upgrade or remove a member to add more.",
  already_on_a_team: "That person is already on a PageBee team.",
  already_invited: "There's already a pending invite for that email.",
  team_not_available: "Team members aren't available on your plan.",
  owner_only: "Only the owner can manage the team.",
  validation_error: "Enter a valid email.",
};

export function TeamManager({ state, isOwner }: { state: TeamState; isOwner: boolean }) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);

  const full = !state.seatsUnlimited && state.seatsUsed >= state.seatLimit;
  const pct = state.seatsUnlimited ? 0 : state.seatLimit > 0 ? Math.min(100, Math.round((state.seatsUsed / state.seatLimit) * 100)) : 0;

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch("/api/v1/client/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: "staff" }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "failed");
      setEmail("");
      setOk("Invitation sent.");
      router.refresh();
    } catch (err) {
      setError(ERR[err instanceof Error ? err.message : "failed"] ?? "Couldn't send the invite — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    await fetch(`/api/v1/client/team/invite/${id}`, { method: "DELETE" });
    router.refresh();
  }
  async function remove(userId: string) {
    await fetch(`/api/v1/client/team/member/${userId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Seat usage */}
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-display text-lg text-stone-900">Seats</p>
            <p className="text-sm text-stone-500">{state.seatsUnlimited ? `${state.seatsUsed} member${state.seatsUsed === 1 ? "" : "s"} · unlimited seats` : `${state.seatsUsed} of ${state.seatLimit} used`}</p>
          </div>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-100 text-violet-700"><ShieldCheck size={20} /></span>
        </div>
        {!state.seatsUnlimited && (
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-stone-100">
            <div className={cn("h-full rounded-full transition-all", full ? "bg-amber-500" : "bg-violet-500")} style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>

      {/* Invite form (owner only) */}
      {isOwner && (
        <form onSubmit={invite} className="rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
          <p className="flex items-center gap-2 font-display text-lg text-stone-900"><UserPlus size={18} className="text-amber-500" /> Invite a teammate</p>
          <p className="mt-1 text-sm text-stone-500">They&apos;ll get an email to set up their login and join {full ? "" : "your team"}.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={full}
              placeholder="teammate@email.com"
              className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-100 disabled:bg-stone-50"
            />
            <Button type="submit" disabled={busy || full}><Mail size={15} /> {busy ? "Sending…" : "Send invite"}</Button>
          </div>
          {full && <p className="mt-2 text-sm text-amber-700">All seats are in use. Upgrade your plan or remove a member to invite more.</p>}
          {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
          {ok && <p className="mt-2 text-sm text-green-700">{ok}</p>}
        </form>
      )}

      {/* Members */}
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
        <p className="font-display text-lg text-stone-900">Members</p>
        <ul className="mt-3 divide-y divide-stone-100">
          {state.members.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-100 to-amber-50 text-xs font-bold text-amber-700">
                {(m.name ?? m.email).slice(0, 2).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium text-stone-900">{m.name ?? m.email}</span>
                  {m.isYou && <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-500">You</span>}
                </span>
                <span className="block truncate text-sm text-stone-500">{m.email}</span>
              </span>
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", m.role === "owner" ? "bg-amber-100 text-amber-800" : "bg-stone-100 text-stone-600")}>
                {m.role === "owner" ? <Crown size={11} /> : null} {m.role === "owner" ? "Owner" : "Member"}
              </span>
              {isOwner && m.role !== "owner" && !m.isYou && (
                <button onClick={() => remove(m.userId)} className="grid h-8 w-8 place-items-center rounded-lg text-stone-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${m.email}`}>
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Pending invites */}
      {state.invites.length > 0 && (
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
          <p className="font-display text-lg text-stone-900">Pending invites</p>
          <ul className="mt-3 divide-y divide-stone-100">
            {state.invites.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-400"><Clock size={16} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-stone-900">{i.email}</span>
                  <span className="block text-xs text-stone-400">Invited · expires {new Date(i.expiresAt).toLocaleDateString()}</span>
                </span>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600">Pending</span>
                {isOwner && (
                  <button onClick={() => revoke(i.id)} className="grid h-8 w-8 place-items-center rounded-lg text-stone-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Revoke invite for ${i.email}`}>
                    <X size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
