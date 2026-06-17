"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Globe, Check, Copy, Loader2, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DomainState } from "@/lib/modules/website";

/**
 * Owner-facing custom-domain panel (Connect/Automate). Submit a domain → it enters admin review →
 * once approved we show the DNS records to set (apex + www) → a background job flips it live. The
 * whole lifecycle is reflected from the `state` prop (re-fetched on router.refresh after actions,
 * and self-polled while DNS is propagating). Backend is the source of truth; this only drives UX.
 */
export function CustomDomainPanel({ initial }: { initial: DomainState | null }) {
  const router = useRouter();
  const [state, setState] = React.useState<DomainState | null>(initial);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [checking, setChecking] = React.useState(false);
  const status = state?.status ?? null;

  /** Trigger a live Vercel verification of this site's pending hosts and update the panel. */
  const runCheck = React.useCallback(async () => {
    const res = await fetch("/api/v1/client/website/domain/verify", { method: "POST" });
    if (!res.ok) return null;
    const data = (await res.json()) as { domain: DomainState | null };
    setState(data.domain);
    return data.domain;
  }, []);

  // While DNS is propagating, actively re-verify every 30s so the panel flips to "Connected"
  // on its own (no daily-cron wait). Stops once active (or no longer verifying).
  React.useEffect(() => {
    if (status !== "verifying") return;
    const id = setInterval(async () => {
      const next = await runCheck();
      if (next?.status === "active") router.refresh();
    }, 30_000);
    return () => clearInterval(id);
  }, [status, router, runCheck]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/client/website/domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: input.trim() }),
      });
      const data = (await res.json().catch(() => null)) as { domain?: DomainState; message?: string } | null;
      if (!res.ok) throw new Error(data?.message ?? "Could not connect that domain.");
      setState(data?.domain ?? null);
      setInput("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await fetch("/api/v1/client/website/domain", { method: "DELETE" });
      setState(null);
      router.refresh();
    } catch {
      setError("Could not remove the domain.");
    } finally {
      setBusy(false);
    }
  }

  // The non-canonical host (www that redirects to the apex, or vice versa) — for a friendly note.
  const secondary = state?.hosts?.find((h) => !h.isPrimary);

  return (
    <div className="anim-rise mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-100 text-amber-700">
          <Globe size={18} />
        </span>
        <div>
          <h2 className="font-display text-xl text-stone-900">Custom domain</h2>
          <p className="text-sm text-stone-500">Use your own domain name instead of your free address.</p>
        </div>
      </div>

      {/* No domain → submit form */}
      {!status && (
        <div className="mt-5">
          <label className="block text-sm font-medium text-stone-700">Your domain</label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="yourbusiness.com"
              className="h-11 flex-1 rounded-xl border border-stone-300 px-4 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/40"
            />
            <Button onClick={submit} disabled={busy || !input.trim()} variant="primary">
              {busy ? "Submitting…" : "Connect domain"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-stone-400">
            We review every domain before connecting it. We set up both <span className="font-medium">yourbusiness.com</span>{" "}
            and <span className="font-medium">www.yourbusiness.com</span> for you. After approval we&apos;ll show the exact
            DNS records to add.
          </p>
        </div>
      )}

      {/* Requested → awaiting admin review */}
      {status === "requested" && (
        <StatusRow
          tone="amber"
          icon={<Clock size={16} />}
          title={`Reviewing ${state?.domain}`}
          body="Your domain is in review. Once approved, we'll show you the DNS records to set here — usually within a day."
          onRemove={remove}
          busy={busy}
        />
      )}

      {/* Verifying → DNS records to set (apex + www), then auto-checks */}
      {status === "verifying" && state && (
        <div className="mt-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-700">
            <Loader2 size={16} className="animate-spin" /> Waiting for DNS — add these records at your registrar
          </div>
          <p className="mt-1 text-sm text-stone-500">
            Sign in to wherever you bought <span className="font-medium text-stone-700">{state.domain}</span> (e.g. GoDaddy,
            Namecheap, Google Domains) and add the records below. This can take a few minutes to a few hours to take effect —
            we&apos;ll switch your site over automatically.
          </p>
          {secondary && (
            <p className="mt-1 text-xs text-stone-400">
              {secondary.host} will automatically redirect to {state.domain}.
            </p>
          )}
          <DnsTable hosts={state.hosts} />
          <div className="mt-4 flex items-center gap-3">
            <Button
              onClick={async () => {
                setChecking(true);
                try {
                  const next = await runCheck();
                  if (next?.status === "active") router.refresh();
                } finally {
                  setChecking(false);
                }
              }}
              variant="outline"
              size="sm"
              disabled={busy || checking}
            >
              {checking ? "Checking…" : "Check status"}
            </Button>
            <button onClick={remove} disabled={busy} className="text-sm text-stone-400 hover:text-stone-700">
              Remove
            </button>
          </div>
        </div>
      )}

      {/* Active → live */}
      {status === "active" && (
        <StatusRow tone="green" icon={<Check size={16} />} title="Connected" body="" onRemove={remove} busy={busy}>
          <a
            href={`https://${state?.domain}`}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-blue-600 underline decoration-blue-300 underline-offset-4 hover:text-blue-700"
          >
            {state?.domain}
          </a>{" "}
          <span className="text-stone-500">
            is live and secured with SSL
            {secondary && secondary.status === "active" ? ` (${secondary.host} redirects here)` : ""}.
          </span>
          {secondary && secondary.status !== "active" && (
            <span className="mt-1 block text-xs text-stone-400">
              {secondary.host} is still finishing its DNS check — the redirect will start working shortly.
            </span>
          )}
        </StatusRow>
      )}

      {/* Error → Vercel/admin failure */}
      {status === "error" && (
        <StatusRow
          tone="rose"
          icon={<AlertTriangle size={16} />}
          title="There was a problem connecting this domain"
          body={state?.hosts?.find((h) => h.error)?.error ?? "Please remove it and try again, or contact support."}
          onRemove={remove}
          busy={busy}
        />
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}

function StatusRow({
  tone,
  icon,
  title,
  body,
  children,
  onRemove,
  busy,
}: {
  tone: "amber" | "green" | "rose";
  icon: React.ReactNode;
  title: string;
  body: string;
  children?: React.ReactNode;
  onRemove: () => void;
  busy: boolean;
}) {
  const tones = {
    amber: "bg-amber-50 text-amber-800",
    green: "bg-green-50 text-green-800",
    rose: "bg-rose-50 text-rose-800",
  } as const;
  return (
    <div className="mt-5">
      <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${tones[tone]}`}>
        {icon} {title}
      </div>
      {(body || children) && <div className="mt-2 text-sm text-stone-600">{children ?? body}</div>}
      <button onClick={onRemove} disabled={busy} className="mt-3 text-sm text-stone-400 hover:text-stone-700">
        Remove domain
      </button>
    </div>
  );
}

/** The DNS records table across all hosts (apex + www), with copy-to-clipboard on each value. */
function DnsTable({ hosts }: { hosts: DomainState["hosts"] }) {
  const rows = hosts.flatMap((h) => {
    const v = h.verification;
    if (!v) return [];
    return [
      ...v.records.map((r) => ({ type: r.type, name: r.name, value: r.value })),
      ...(v.txt ?? []).map((t) => ({ type: t.type, name: t.domain, value: t.value })),
    ];
  });
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-stone-200">
      <table className="w-full min-w-[420px] text-sm">
        <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
          <tr>
            <th className="px-4 py-2 font-medium">Type</th>
            <th className="px-4 py-2 font-medium">Name / Host</th>
            <th className="px-4 py-2 font-medium">Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="px-4 py-2 font-mono text-stone-700">{r.type}</td>
              <td className="px-4 py-2 font-mono text-stone-700">{r.name}</td>
              <td className="px-4 py-2">
                <CopyValue value={r.value} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1.5 font-mono text-stone-700 hover:text-amber-700"
      title="Copy"
    >
      {value}
      {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} className="text-stone-400" />}
    </button>
  );
}
