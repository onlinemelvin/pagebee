"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Mail, Trash2, Clock, Crown, ShieldCheck, X, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TeamState } from "@/lib/modules/team";
import { TEAM_AREAS, keysToLevel, permissionsFromLevels, type AccessLevel } from "@/lib/modules/team/permissions";
import { PermissionEditor, accessSummary } from "./PermissionEditor";

const ERR: Record<string, string> = {
  seat_limit_reached: "You've used all your seats. Upgrade or remove a member to add more.",
  already_on_a_team: "That person is already on a PageBee team.",
  already_invited: "There's already a pending invite for that email.",
  team_not_available: "Team members aren't available on your plan.",
  owner_only: "Only the owner can manage the team.",
  validation_error: "Enter a valid email.",
};

type Levels = Record<string, AccessLevel>;

/** Sensible starting point for a new teammate: day-to-day areas on, money off. */
const DEFAULT_INVITE_LEVELS: Levels = { inquiries: "manage", customers: "manage", appointments: "manage", website: "view", finance: "none" };

/** Stored capability keys → an area→level map for the editor. */
function levelsFromPermissions(perms: string[]): Levels {
  return Object.fromEntries(TEAM_AREAS.map((a) => [a.key, keysToLevel(perms, a.key)]));
}

export function TeamManager({ state, isOwner }: { state: TeamState; isOwner: boolean }) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);
  const [inviteLevels, setInviteLevels] = React.useState<Levels>(DEFAULT_INVITE_LEVELS);

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
        body: JSON.stringify({ email, role: "staff", permissions: permissionsFromLevels(inviteLevels) }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "failed");
      setEmail("");
      setInviteLevels(DEFAULT_INVITE_LEVELS);
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

          {/* Per-area access for the invitee */}
          <div className="mt-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
              <SlidersHorizontal size={13} /> What can they access?
            </p>
            <PermissionEditor value={inviteLevels} onChange={setInviteLevels} disabled={full} />
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
            <MemberRow key={m.userId} member={m} canManage={isOwner && m.role !== "owner" && !m.isYou} onRemove={() => remove(m.userId)} />
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
                  <span className="block text-xs text-stone-400">
                    {i.role === "owner" ? "Owner" : accessSummary(levelsFromPermissions(i.permissions))} · expires {new Date(i.expiresAt).toLocaleDateString()}
                  </span>
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

/** One member row with an inline, owner-only access editor. */
function MemberRow({
  member,
  canManage,
  onRemove,
}: {
  member: TeamState["members"][number];
  canManage: boolean;
  onRemove: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [levels, setLevels] = React.useState<Levels>(() => levelsFromPermissions(member.permissions));
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const isOwnerMember = member.role === "owner";

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/v1/client/team/member/${member.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: permissionsFromLevels(levels) }),
      });
      if (!res.ok) throw new Error("failed");
      setEditing(false);
      router.refresh();
    } catch {
      setErr("Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-100 to-amber-50 text-xs font-bold text-amber-700">
          {(member.name ?? member.email).slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium text-stone-900">{member.name ?? member.email}</span>
            {member.isYou && <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-500">You</span>}
          </span>
          <span className="block truncate text-sm text-stone-500">{member.email}</span>
          {!isOwnerMember && <span className="mt-0.5 block truncate text-xs text-stone-400">{accessSummary(levelsFromPermissions(member.permissions))}</span>}
        </span>
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", isOwnerMember ? "bg-amber-100 text-amber-800" : "bg-stone-100 text-stone-600")}>
          {isOwnerMember ? <Crown size={11} /> : null} {isOwnerMember ? "Owner" : "Member"}
        </span>
        {canManage && (
          <button onClick={() => setEditing((v) => !v)} className={cn("grid h-8 w-8 place-items-center rounded-lg", editing ? "bg-amber-50 text-amber-700" : "text-stone-400 hover:bg-stone-50 hover:text-stone-700")} aria-label={`Edit access for ${member.email}`}>
            <SlidersHorizontal size={15} />
          </button>
        )}
        {canManage && (
          <button onClick={onRemove} className="grid h-8 w-8 place-items-center rounded-lg text-stone-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${member.email}`}>
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {editing && canManage && (
        <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50/50 p-3">
          <PermissionEditor value={levels} onChange={setLevels} disabled={saving} />
          {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" disabled={saving} onClick={() => { setLevels(levelsFromPermissions(member.permissions)); setEditing(false); }}>Cancel</Button>
            <Button disabled={saving} onClick={save}>{saving ? "Saving…" : "Save access"}</Button>
          </div>
        </div>
      )}
    </li>
  );
}
