"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface FollowUpRow {
  id: string;
  dueAt: string;
  note: string | null;
  overdue: boolean;
  prospect: { id: string; businessName: string };
}

export function FollowUpsList({ initial }: { initial: FollowUpRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function complete(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/v1/rep/follow-ups/${id}`, { method: "PATCH" });
      if (res.ok) router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (initial.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-200 bg-white p-12 text-center">
        <CalendarClock size={28} className="mx-auto text-stone-300" />
        <p className="mt-3 text-sm text-stone-500">No open follow-ups. Nice and clear.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
      {initial.map((f) => (
        <li key={f.id} className="flex items-center gap-4 px-5 py-4">
          <div className="min-w-0 flex-1">
            <Link href={`/rep/prospects/${f.prospect.id}`} className="font-medium text-stone-900 hover:text-amber-700">
              {f.prospect.businessName}
            </Link>
            {f.note ? <p className="mt-0.5 truncate text-xs text-stone-500">{f.note}</p> : null}
          </div>
          <span
            className={cn(
              "text-xs font-medium",
              f.overdue ? "text-rose-600" : "text-stone-400",
            )}
          >
            {f.overdue ? "Overdue · " : "Due "}
            {new Date(f.dueAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
          </span>
          <Button size="sm" variant="ghost" disabled={busyId === f.id} onClick={() => complete(f.id)}>
            <Check size={15} /> Done
          </Button>
        </li>
      ))}
    </ul>
  );
}
