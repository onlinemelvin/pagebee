"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { TEAM_AREAS, type AccessLevel } from "@/lib/modules/team/permissions";

const LEVELS: { value: AccessLevel; label: string }[] = [
  { value: "none", label: "No access" },
  { value: "view", label: "View" },
  { value: "manage", label: "Full" },
];

/** Per-area access picker (No access / View / Full) used in the invite form and member editor.
 *  Controlled: parent owns the area→level map. */
export function PermissionEditor({
  value,
  onChange,
  disabled,
}: {
  value: Record<string, AccessLevel>;
  onChange: (next: Record<string, AccessLevel>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      {TEAM_AREAS.map((a) => {
        const current = value[a.key] ?? "none";
        return (
          <div key={a.key} className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-stone-50/70 px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-stone-800">{a.label}</p>
              <p className="truncate text-xs text-stone-400">{a.description}</p>
            </div>
            <div className="flex shrink-0 rounded-lg border border-stone-200 bg-white p-0.5">
              {LEVELS.map((l) => {
                const active = current === l.value;
                return (
                  <button
                    key={l.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange({ ...value, [a.key]: l.value })}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition disabled:opacity-50",
                      active ? "bg-amber-400 text-stone-950 shadow-sm" : "text-stone-500 hover:text-stone-800",
                    )}
                    aria-pressed={active}
                  >
                    {l.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** A short human summary of a member's access, e.g. "Inquiries, Customers · Finance (view)". */
export function accessSummary(levels: Record<string, AccessLevel>): string {
  const full = TEAM_AREAS.filter((a) => levels[a.key] === "manage").map((a) => a.label);
  const view = TEAM_AREAS.filter((a) => levels[a.key] === "view").map((a) => a.label);
  const parts: string[] = [];
  if (full.length) parts.push(full.join(", "));
  if (view.length) parts.push(`${view.join(", ")} (view)`);
  return parts.length ? parts.join(" · ") : "No feature access yet";
}
