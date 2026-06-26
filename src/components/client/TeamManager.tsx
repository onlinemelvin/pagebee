"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { UserPlus, Mail, Trash2, Clock, Crown, ShieldCheck, X, SlidersHorizontal, ArrowRight, Ban, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TeamState } from "@/lib/modules/team";
import { keysToLevel, permissionsFromLevels, type AccessLevel, type TeamArea } from "@/lib/modules/team/permissions";
import { PermissionEditor, accessSummary } from "./PermissionEditor";

const ERR: Record<string, string> = {
  seat_limit_reached: "You've used all your seats. Upgrade or remove a member to add more.",
  already_on_a_team: "That person is already on a PageBee team.",
  already_invited: "There's already a pending invite for that email.",
  team_not_available: "Team members aren't available on your plan.",
  owner_only: "Only the owner can manage the team.",
  email_failed: "We couldn't deliver the invitation email — check the address and try again.",
  validation_error: "Enter a valid email.",
};

type Levels = Record<string, AccessLevel>;

/** Sensible starting point for a new teammate, by area: day-to-day areas on, money off. Only the
 *  plan-enabled areas are ever surfaced, so off-plan defaults here are inert. */
const DEFAULT_LEVEL: Record<string, AccessLevel> = { inquiries: "manage", customers: "manage", appointments: "manage", website: "view", finance: "none" };

/** A starting level map over exactly the enabled areas (never includes off-plan keys). */
function defaultLevels(areas: TeamArea[]): Levels {
  return Object.fromEntries(areas.map((a) => [a.key, DEFAULT_LEVEL[a.key] ?? "none"]));
}

/** Stored capability keys → an area→level map for the editor, scoped to the enabled areas. */
function levelsFromPermissions(perms: string[], areas: TeamArea[]): Levels {
  return Object.fromEntries(areas.map((a) => [a.key, keysToLevel(perms, a.key)]));
}

export function TeamManager({ state, isOwner, areas }: { state: TeamState; isOwner: boolean; areas: TeamArea[] }) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);
  const [accessOpen, setAccessOpen] = React.useState(false);
  const [inviteLevels, setInviteLevels] = React.useState<Levels>(() => defaultLevels(areas));

  const full = !state.seatsUnlimited && state.seatsUsed >= state.seatLimit;
  const pct = state.seatsUnlimited ? 0 : state.seatLimit > 0 ? Math.min(100, Math.round((state.seatsUsed / state.seatLimit) * 100)) : 0;

  // Step 1 → 2: validate the email and confirm it's free to invite, then open the access modal.
  async function next(e: React.FormEvent) {
    e.preventDefault();
    if (full || !email.trim() || busy) return;
    setError(null);
    setOk(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/client/team/invite?email=${encodeURIComponent(email.trim())}`);
      const data = (await res.json().catch(() => null)) as { status?: string; error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "failed");
      if (data?.status && data.status !== "ok") throw new Error(data.status);
      setInviteLevels(defaultLevels(areas));
      setAccessOpen(true);
    } catch (err) {
      setError(ERR[err instanceof Error ? err.message : "failed"] ?? "Couldn't check that email — try again.");
    } finally {
      setBusy(false);
    }
  }

  // Step 2: send the invite with the chosen per-area access.
  async function invite() {
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
      setInviteLevels(defaultLevels(areas));
      setAccessOpen(false);
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

      {/* Invite form (owner only) — step 1: just the email. Access is chosen next, in a modal. */}
      {isOwner && (
        <form onSubmit={next} className="rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
          <p className="flex items-center gap-2 font-display text-lg text-stone-900"><UserPlus size={18} className="text-amber-500" /> Invite a teammate</p>
          <p className="mt-1 text-sm text-stone-500">Enter their email — you&apos;ll choose what they can access next.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={full || busy}
              placeholder="teammate@email.com"
              className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-100 disabled:bg-stone-50"
            />
            <Button type="submit" disabled={full || busy}>{busy && !accessOpen ? "Checking…" : <>Next <ArrowRight size={15} /></>}</Button>
          </div>

          {full && <p className="mt-2 text-sm text-amber-700">All seats are in use. Upgrade your plan or remove a member to invite more.</p>}
          {error && !accessOpen && <p className="mt-2 text-sm text-rose-600">{error}</p>}
          {ok && <p className="mt-2 text-sm text-green-700">{ok}</p>}
        </form>
      )}

      {/* Members */}
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
        <p className="font-display text-lg text-stone-900">Members</p>
        <ul className="mt-3 divide-y divide-stone-100">
          {state.members.map((m) => (
            <MemberRow key={m.userId} member={m} areas={areas} canManage={isOwner && m.role !== "owner" && !m.isYou} onRemove={() => remove(m.userId)} />
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
                    {i.role === "owner" ? "Owner" : accessSummary(levelsFromPermissions(i.permissions, areas), areas)} · expires {new Date(i.expiresAt).toLocaleDateString()}
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

      {/* Step 2: access picker modal */}
      {accessOpen && (
        <AccessModal
          title="What can they access?"
          subtitle={<>Choose what <span className="font-medium text-stone-700">{email}</span> can see and manage. They start with no access to anything you leave off.</>}
          areas={areas}
          levels={inviteLevels}
          onChange={setInviteLevels}
          busy={busy}
          error={error}
          confirmLabel={busy ? "Sending…" : "Send invite"}
          confirmIcon={<Mail size={15} />}
          onConfirm={invite}
          onClose={() => !busy && setAccessOpen(false)}
        />
      )}
    </div>
  );
}

/** A centered modal for picking per-area access — shared by the invite step and member editing. */
function AccessModal({
  title,
  subtitle,
  areas,
  levels,
  onChange,
  busy,
  error,
  confirmLabel,
  confirmIcon,
  onConfirm,
  onClose,
}: {
  title: string;
  subtitle: React.ReactNode;
  areas: TeamArea[];
  levels: Levels;
  onChange: (next: Levels) => void;
  busy: boolean;
  error: string | null;
  confirmLabel: string;
  confirmIcon?: React.ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/50 p-4" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className="flex items-center gap-2 font-display text-xl text-stone-900"><SlidersHorizontal size={18} className="text-amber-500" /> {title}</h2>
          <button onClick={onClose} disabled={busy} className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600 disabled:opacity-50" aria-label="Close"><X size={18} /></button>
        </div>
        <p className="mt-1 text-sm text-stone-600">{subtitle}</p>

        <div className="mt-4">
          <PermissionEditor value={levels} onChange={onChange} disabled={busy} areas={areas} />
        </div>

        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Back</Button>
          <Button onClick={onConfirm} disabled={busy}>{confirmIcon} {confirmLabel}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** One member row. Owners can edit a staff member's access (but never the owner's) in a modal. */
function MemberRow({
  member,
  areas,
  canManage,
  onRemove,
}: {
  member: TeamState["members"][number];
  areas: TeamArea[];
  canManage: boolean;
  onRemove: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [levels, setLevels] = React.useState<Levels>(() => levelsFromPermissions(member.permissions, areas));
  const [saving, setSaving] = React.useState(false);
  const [working, setWorking] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const isOwnerMember = member.role === "owner";

  function open() {
    setLevels(levelsFromPermissions(member.permissions, areas));
    setErr(null);
    setEditing(true);
  }

  // Disable = lock the member out entirely (User.status → DISABLED); they're signed out and can't
  // log in until re-enabled. Reversible, and keeps their membership/permissions intact.
  async function toggleDisabled() {
    const disable = !member.disabled;
    if (disable && !window.confirm(`Disable ${member.name ?? member.email}? They'll be signed out and won't be able to log in until you re-enable them.`)) return;
    setWorking(true);
    try {
      await fetch(`/api/v1/client/team/member/${member.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: disable }),
      });
      router.refresh();
    } finally {
      setWorking(false);
    }
  }

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
        <span className={cn("min-w-0 flex-1", member.disabled && "opacity-50")}>
          <span className="flex items-center gap-2">
            <span className="truncate font-medium text-stone-900">{member.name ?? member.email}</span>
            {member.isYou && <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-500">You</span>}
          </span>
          <span className="block truncate text-sm text-stone-500">{member.email}</span>
          {!isOwnerMember && <span className="mt-0.5 block truncate text-xs text-stone-400">{accessSummary(levelsFromPermissions(member.permissions, areas), areas)}</span>}
        </span>
        {member.disabled && <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">Disabled</span>}
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", isOwnerMember ? "bg-amber-100 text-amber-800" : "bg-stone-100 text-stone-600")}>
          {isOwnerMember ? <Crown size={11} /> : null} {isOwnerMember ? "Owner" : "Member"}
        </span>
        {canManage && (
          <button onClick={open} className="grid h-8 w-8 place-items-center rounded-lg text-stone-400 hover:bg-stone-50 hover:text-stone-700" aria-label={`Edit access for ${member.email}`}>
            <SlidersHorizontal size={15} />
          </button>
        )}
        {canManage && (
          <button
            onClick={toggleDisabled}
            disabled={working}
            className={cn(
              "grid h-8 w-8 place-items-center rounded-lg disabled:opacity-50",
              member.disabled ? "text-emerald-500 hover:bg-emerald-50 hover:text-emerald-700" : "text-stone-400 hover:bg-amber-50 hover:text-amber-700",
            )}
            aria-label={member.disabled ? `Enable ${member.email}` : `Disable ${member.email}`}
            title={member.disabled ? "Enable account" : "Disable account"}
          >
            {member.disabled ? <UserCheck size={15} /> : <Ban size={15} />}
          </button>
        )}
        {canManage && (
          <button onClick={onRemove} className="grid h-8 w-8 place-items-center rounded-lg text-stone-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${member.email}`}>
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {editing && canManage && (
        <AccessModal
          title="Edit access"
          subtitle={<>Update what <span className="font-medium text-stone-700">{member.name ?? member.email}</span> can see and manage.</>}
          areas={areas}
          levels={levels}
          onChange={setLevels}
          busy={saving}
          error={err}
          confirmLabel={saving ? "Saving…" : "Save access"}
          onConfirm={save}
          onClose={() => !saving && setEditing(false)}
        />
      )}
    </li>
  );
}
