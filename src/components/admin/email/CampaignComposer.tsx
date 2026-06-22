"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PLANS = ["NECTAR", "HONEY", "HIVE"];
const STATUSES = ["active", "suspended", "churned"];
const CATEGORIES = [
  { value: "ANNOUNCEMENT", label: "Product announcement" },
  { value: "TIPS", label: "Tips & how-tos" },
  { value: "PROMOTION", label: "Offer / promotion" },
];

export interface TemplateOption {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
}

export function CampaignComposer({ templates }: { templates: TemplateOption[] }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [category, setCategory] = React.useState("ANNOUNCEMENT");
  const [bodyHtml, setBodyHtml] = React.useState("");
  const [plans, setPlans] = React.useState<string[]>([]);
  const [statuses, setStatuses] = React.useState<string[]>(["active"]);
  const [includeTest, setIncludeTest] = React.useState(false);
  const [scheduledAt, setScheduledAt] = React.useState("");
  const [count, setCount] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const segment = React.useMemo(
    () => ({ plans: plans.length ? plans : undefined, statuses: statuses.length ? statuses : undefined, includeTest }),
    [plans, statuses, includeTest],
  );

  // Live recipient-count preview.
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/admin/email/segment-count", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(segment),
    })
      .then((r) => r.json())
      .then((d: { count?: number }) => !cancelled && setCount(d.count ?? null))
      .catch(() => !cancelled && setCount(null));
    return () => {
      cancelled = true;
    };
  }, [segment]);

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  function applyTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (t) {
      setSubject(t.subject);
      setBodyHtml(t.bodyHtml);
      if (!name) setName(t.name);
    }
  }

  async function submit(mode: "draft" | "send" | "schedule") {
    setError(null);
    if (!name || !subject || !bodyHtml) {
      setError("Name, subject, and body are required.");
      return;
    }
    if (mode === "schedule" && !scheduledAt) {
      setError("Pick a date & time to schedule.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/admin/email/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          subject,
          bodyHtml,
          category,
          segment,
          scheduledAt: mode === "schedule" ? new Date(scheduledAt).toISOString() : null,
        }),
      });
      const data = (await res.json()) as { campaign?: { id: string }; error?: string };
      if (!res.ok || !data.campaign) throw new Error(data.error ?? "Failed to create campaign.");

      if (mode === "send") {
        const sendRes = await fetch(`/api/v1/admin/email/campaigns/${data.campaign.id}?action=send`, { method: "POST" });
        if (!sendRes.ok) throw new Error("Campaign created but sending failed — see Campaigns list.");
      }
      router.push("/admin/email/campaigns");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium transition-colors ${active ? "border-amber-400 bg-amber-50 text-amber-800" : "border-stone-300 text-stone-600 hover:bg-stone-50"}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
        {templates.length > 0 && (
          <div className="grid gap-2">
            <Label>Start from a template</Label>
            <select onChange={(e) => e.target.value && applyTemplate(e.target.value)} defaultValue="" className="rounded-lg border border-stone-300 px-3 py-2 text-sm">
              <option value="">— none —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="name">Campaign name <span className="text-stone-400">(internal)</span></Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="June product update" />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="subject">Subject line</Label>
          <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What's new in PageBee" />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="category">Category</Label>
          <select id="category" value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-stone-300 px-3 py-2 text-sm">
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <p className="text-xs text-stone-400">All campaign emails include a one-click unsubscribe footer and skip anyone who has opted out.</p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="body">Body (HTML)</Label>
          <textarea
            id="body"
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            rows={12}
            placeholder="<p>Hi there,</p><p>We just shipped…</p>"
            className="rounded-lg border border-stone-300 p-3 font-mono text-xs"
          />
          <p className="text-xs text-stone-400">Wrapped in the branded PageBee layout automatically. Use simple HTML (&lt;p&gt;, &lt;a&gt;, &lt;strong&gt;).</p>
        </div>

        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

        <div className="flex flex-wrap gap-3 border-t border-stone-100 pt-4">
          <Button onClick={() => submit("send")} disabled={busy}>{busy ? "Working…" : `Send now${count !== null ? ` (${count})` : ""}`}</Button>
          <Button variant="outline" onClick={() => submit("schedule")} disabled={busy}>Schedule</Button>
          <Button variant="ghost" onClick={() => submit("draft")} disabled={busy}>Save draft</Button>
        </div>
      </div>

      {/* Audience */}
      <div className="space-y-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Audience</h2>
          <p className="mt-2 font-display text-3xl text-stone-900">{count ?? "—"}</p>
          <p className="text-xs text-stone-400">recipients match this segment</p>
        </div>

        <div className="grid gap-2">
          <Label>Plans <span className="text-stone-400">(any if none selected)</span></Label>
          <div className="flex flex-wrap gap-2">
            {PLANS.map((p) => (
              <button key={p} type="button" onClick={() => toggle(plans, setPlans, p)} className={chip(plans.includes(p))}>{p}</button>
            ))}
          </div>
        </div>

        <div className="grid gap-2">
          <Label>Account status</Label>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <button key={s} type="button" onClick={() => toggle(statuses, setStatuses, s)} className={chip(statuses.includes(s))}>{s}</button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-stone-600">
          <input type="checkbox" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} />
          Include test accounts
        </label>

        <div className="grid gap-2 border-t border-stone-100 pt-4">
          <Label htmlFor="sched">Schedule for</Label>
          <Input id="sched" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        </div>
      </div>
    </div>
  );
}
