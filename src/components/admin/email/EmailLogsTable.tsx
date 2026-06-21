"use client";

import * as React from "react";

export interface EmailLogRow {
  id: string;
  toEmail: string;
  subject: string;
  category: string;
  status: string;
  template: string | null;
  openCount: number;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  QUEUED: "bg-stone-100 text-stone-600",
  SENT: "bg-sky-100 text-sky-700",
  DELIVERED: "bg-emerald-100 text-emerald-700",
  OPENED: "bg-violet-100 text-violet-700",
  BOUNCED: "bg-rose-100 text-rose-700",
  FAILED: "bg-rose-100 text-rose-700",
};

const STATUSES = ["", "QUEUED", "SENT", "DELIVERED", "OPENED", "BOUNCED", "FAILED"];
const CATEGORIES = ["", "WELCOME", "AUTH", "BILLING", "WEBSITE", "USAGE", "ACCOUNT", "TIPS", "ANNOUNCEMENT", "PROMOTION"];

export function EmailLogsTable({ initial, initialCursor }: { initial: EmailLogRow[]; initialCursor: string | null }) {
  const [rows, setRows] = React.useState(initial);
  const [cursor, setCursor] = React.useState(initialCursor);
  const [status, setStatus] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(
    async (reset: boolean) => {
      setLoading(true);
      const sp = new URLSearchParams();
      if (status) sp.set("status", status);
      if (category) sp.set("category", category);
      if (search) sp.set("search", search);
      if (!reset && cursor) sp.set("cursor", cursor);
      const res = await fetch(`/api/v1/admin/email/logs?${sp}`);
      const data = (await res.json()) as { rows: EmailLogRow[]; nextCursor: string | null };
      setRows((prev) => (reset ? data.rows : [...prev, ...data.rows]));
      setCursor(data.nextCursor);
      setLoading(false);
    },
    [status, category, search, cursor],
  );

  // Re-query whenever a filter changes (debounced for search).
  React.useEffect(() => {
    const t = setTimeout(() => load(true), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, category, search]);

  const selectCls = "rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-700";

  return (
    <div className="rounded-2xl border border-stone-200 bg-white shadow-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 p-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search email or subject…"
          className="min-w-[200px] flex-1 rounded-lg border border-stone-300 px-3 py-1.5 text-sm"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s || "All statuses"}</option>
          ))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c || "All categories"}</option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100 text-left text-xs uppercase tracking-wide text-stone-400">
              <th className="px-4 py-2.5 font-medium">Recipient</th>
              <th className="px-4 py-2.5 font-medium">Subject</th>
              <th className="px-4 py-2.5 font-medium">Category</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Opens</th>
              <th className="px-4 py-2.5 font-medium">Sent</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-stone-50 last:border-0 hover:bg-stone-50/60">
                <td className="max-w-[200px] truncate px-4 py-2.5 text-stone-700">{r.toEmail}</td>
                <td className="max-w-[260px] truncate px-4 py-2.5 text-stone-600">{r.subject}</td>
                <td className="px-4 py-2.5 text-xs text-stone-500">{r.category}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[r.status] ?? "bg-stone-100 text-stone-600"}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-stone-500">{r.openCount || "—"}</td>
                <td className="px-4 py-2.5 text-xs text-stone-400">{new Date(r.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-stone-400">No emails match these filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-center border-t border-stone-100 p-3">
        {cursor ? (
          <button onClick={() => load(false)} disabled={loading} className="text-sm font-medium text-amber-700 hover:underline disabled:opacity-50">
            {loading ? "Loading…" : "Load more"}
          </button>
        ) : (
          <span className="text-xs text-stone-400">{loading ? "Loading…" : `${rows.length} shown`}</span>
        )}
      </div>
    </div>
  );
}
