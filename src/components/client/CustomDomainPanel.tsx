"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Globe, Check, Copy, Loader2, AlertTriangle, Clock, ShoppingCart, Sparkles, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { knownRegistrars } from "@/lib/site/registrar-instructions";
import type { DomainState, DomainLookup, DomainSuggestion, ConnectInstructions } from "@/lib/modules/website";

const TLD_OPTIONS = ["com", "biz", "us", "net", "org", "co"];

/**
 * Owner-facing custom-domain panel (Connect/Automate). Two paths:
 *   • "I already have a domain" → connect it (admin approves → DNS records + registrar-specific
 *     setup steps → live).
 *   • "Buy a new domain" → AI/manual search with availability + price; PageBee buys it (auto under
 *     the price cap, else admin price-review) and sets it up automatically.
 * Backend is the source of truth; this drives UX and self-polls while DNS/verification settles.
 */
export function CustomDomainPanel({ initial }: { initial: DomainState | null }) {
  const router = useRouter();
  const [state, setState] = React.useState<DomainState | null>(initial);
  const [mode, setMode] = React.useState<"choose" | "connect" | "buy">("choose");
  const [error, setError] = React.useState<string | null>(null);
  const status = state?.status ?? null;
  const isPurchase = state?.hosts?.find((h) => h.isPrimary)?.source === "purchase";

  const runCheck = React.useCallback(async () => {
    const res = await fetch("/api/v1/client/website/domain/verify", { method: "POST" });
    if (!res.ok) return null;
    const data = (await res.json()) as { domain: DomainState | null };
    setState(data.domain);
    return data.domain;
  }, []);

  // While verifying (connect DNS or a just-bought domain), re-verify every 30s so it flips to live.
  React.useEffect(() => {
    if (status !== "verifying" && status !== "purchasing") return;
    const id = setInterval(async () => {
      const next = await runCheck();
      if (next?.status === "active") router.refresh();
    }, 30_000);
    return () => clearInterval(id);
  }, [status, router, runCheck]);

  async function remove() {
    setError(null);
    await fetch("/api/v1/client/website/domain", { method: "DELETE" });
    setState(null);
    setMode("choose");
    router.refresh();
  }

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

      {/* ── No domain yet: choose a path ── */}
      {!status && mode === "choose" && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => setMode("connect")}
            className="rounded-2xl border border-stone-200 p-5 text-left transition hover:border-amber-300 hover:bg-amber-50/40"
          >
            <Globe size={20} className="text-stone-700" />
            <p className="mt-2 font-semibold text-stone-900">I already have a domain</p>
            <p className="mt-1 text-sm text-stone-500">Connect a domain you bought elsewhere. We&apos;ll guide the DNS setup.</p>
          </button>
          <button
            onClick={() => setMode("buy")}
            className="rounded-2xl border border-stone-200 p-5 text-left transition hover:border-amber-300 hover:bg-amber-50/40"
          >
            <ShoppingCart size={20} className="text-stone-700" />
            <p className="mt-2 font-semibold text-stone-900">Buy a new domain</p>
            <p className="mt-1 text-sm text-stone-500">Search names, see pricing, and we&apos;ll register &amp; set it up for you.</p>
          </button>
        </div>
      )}

      {!status && mode === "connect" && <ConnectForm onBack={() => setMode("choose")} onDone={setState} />}
      {!status && mode === "buy" && <BuyForm onBack={() => setMode("choose")} onDone={setState} />}

      {/* ── Connect path: awaiting admin approval ── */}
      {status === "requested" && (
        <StatusRow tone="amber" icon={<Clock size={16} />} title={`Reviewing ${state?.domain}`} onRemove={remove}>
          Your domain is in review. Once approved, we&apos;ll show the DNS records and exact setup steps here.
        </StatusRow>
      )}

      {/* ── Buy path: over the cap, awaiting admin price review ── */}
      {status === "price_review" && (
        <StatusRow tone="amber" icon={<Clock size={16} />} title={`Reviewing ${state?.domain}`} onRemove={remove}>
          This domain costs more than our standard limit, so our team is reviewing it. We&apos;ll register and set it up if approved — no action needed.
        </StatusRow>
      )}

      {/* ── Buy path: registering ── */}
      {status === "purchasing" && (
        <div className="mt-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-violet-700">
            <Loader2 size={16} className="animate-spin" /> Registering {state?.domain}…
          </div>
          <p className="mt-1 text-sm text-stone-500">This only takes a moment. We&apos;ll set everything up automatically.</p>
        </div>
      )}

      {/* ── Verifying: connect shows DNS+instructions; a bought domain is automatic ── */}
      {status === "verifying" && state && isPurchase && (
        <StatusRow tone="amber" icon={<Loader2 size={16} className="animate-spin" />} title={`Setting up ${state.domain}`} onRemove={remove}>
          We registered your domain and we&apos;re connecting it now — this is automatic and usually takes a few minutes. The page will update when it&apos;s live.
        </StatusRow>
      )}

      {status === "verifying" && state && !isPurchase && (
        <ConnectVerifying state={state} secondaryHost={secondary?.host} onCheck={runCheck} onRefresh={() => router.refresh()} onRemove={remove} />
      )}

      {/* ── Active ── */}
      {status === "active" && (
        <StatusRow tone="green" icon={<Check size={16} />} title="Connected" onRemove={remove}>
          <a href={`https://${state?.domain}`} target="_blank" rel="noreferrer" className="font-semibold text-blue-600 underline decoration-blue-300 underline-offset-4 hover:text-blue-700">
            {state?.domain}
          </a>{" "}
          <span className="text-stone-500">
            is live and secured with SSL{secondary && secondary.status === "active" ? ` (${secondary.host} redirects here)` : ""}.
          </span>
        </StatusRow>
      )}

      {/* ── Error ── */}
      {status === "error" && (
        <StatusRow tone="rose" icon={<AlertTriangle size={16} />} title="There was a problem with this domain" onRemove={remove}>
          {state?.hosts?.find((h) => h.error)?.error ?? "Please remove it and try again, or contact support."}
        </StatusRow>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}

// ── Connect: enter a domain you already own ──────────────────────────────────
function ConnectForm({ onBack, onDone }: { onBack: () => void; onDone: (s: DomainState | null) => void }) {
  const router = useRouter();
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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
      onDone(data?.domain ?? null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5">
      <BackLink onClick={onBack} />
      <label className="mt-3 block text-sm font-medium text-stone-700">Your domain</label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="yourbusiness.com"
          className="h-11 flex-1 rounded-xl border border-stone-300 px-4 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/40"
        />
        <Button onClick={submit} disabled={busy || !input.trim()} variant="primary">
          {busy ? "Submitting…" : "Connect"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-stone-400">
        We review every domain, then walk you through adding the DNS records at your registrar (we set up both your domain and the www version).
      </p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

// ── Connect: verifying → DNS records + registrar-specific steps ──────────────
function ConnectVerifying({
  state,
  secondaryHost,
  onCheck,
  onRefresh,
  onRemove,
}: {
  state: DomainState;
  secondaryHost?: string;
  onCheck: () => Promise<DomainState | null>;
  onRefresh: () => void;
  onRemove: () => void;
}) {
  const [registrar, setRegistrar] = React.useState("");
  const [instructions, setInstructions] = React.useState<ConnectInstructions | null>(null);
  const [loadingSteps, setLoadingSteps] = React.useState(false);
  const [checking, setChecking] = React.useState(false);

  async function pickRegistrar(key: string) {
    setRegistrar(key);
    setInstructions(null);
    if (!key) return;
    setLoadingSteps(true);
    try {
      const res = await fetch("/api/v1/client/website/domain/instructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrar: key }),
      });
      const data = (await res.json().catch(() => null)) as { instructions?: ConnectInstructions } | null;
      setInstructions(data?.instructions ?? null);
    } finally {
      setLoadingSteps(false);
    }
  }

  return (
    <div className="mt-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-700">
        <Loader2 size={16} className="animate-spin" /> Add these records at your registrar
      </div>
      <p className="mt-1 text-sm text-stone-500">
        Add the records below wherever you manage <span className="font-medium text-stone-700">{state.domain}</span>. We&apos;ll switch your
        site over automatically — usually within minutes.
      </p>
      {secondaryHost && <p className="mt-1 text-xs text-stone-400">{secondaryHost} will redirect to {state.domain}.</p>}

      <DnsTable hosts={state.hosts} />

      {/* Registrar-specific where-to-click steps */}
      <div className="mt-4">
        <label className="block text-sm font-medium text-stone-700">Where did you buy this domain?</label>
        <select
          value={registrar}
          onChange={(e) => pickRegistrar(e.target.value)}
          className="mt-2 h-10 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-amber-400"
        >
          <option value="">Select your provider…</option>
          {knownRegistrars().map((r) => (
            <option key={r.key} value={r.key}>{r.name}</option>
          ))}
          <option value="other">Other / not sure</option>
        </select>
        {loadingSteps && <p className="mt-2 text-sm text-stone-400">Getting steps…</p>}
        {instructions && (
          <div className="mt-3 rounded-xl bg-stone-50 p-4">
            <p className="text-sm font-semibold text-stone-800">
              {instructions.registrar}
              {instructions.dnsUrl && (
                <a href={instructions.dnsUrl} target="_blank" rel="noreferrer" className="ml-2 text-xs font-medium text-blue-600 underline">open DNS settings ↗</a>
              )}
            </p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-stone-600">
              {instructions.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button
          onClick={async () => {
            setChecking(true);
            try {
              const next = await onCheck();
              if (next?.status === "active") onRefresh();
            } finally {
              setChecking(false);
            }
          }}
          variant="outline"
          size="sm"
          disabled={checking}
        >
          {checking ? "Checking…" : "Check status"}
        </Button>
        <button onClick={onRemove} className="text-sm text-stone-400 hover:text-stone-700">Remove</button>
      </div>
    </div>
  );
}

// ── Buy: search (AI + manual), price, purchase ───────────────────────────────
function BuyForm({ onBack, onDone }: { onBack: () => void; onDone: (s: DomainState | null) => void }) {
  const router = useRouter();
  const [tlds, setTlds] = React.useState<string[]>(["com"]);
  const [keyword, setKeyword] = React.useState("");
  const [suggesting, setSuggesting] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<DomainSuggestion[] | null>(null);
  const [manual, setManual] = React.useState("");
  const [checking, setChecking] = React.useState(false);
  const [lookup, setLookup] = React.useState<DomainLookup | null>(null);
  const [buying, setBuying] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function toggleTld(t: string) {
    setTlds((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  }

  async function suggest() {
    setSuggesting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/client/website/domain/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tlds, keyword: keyword.trim() || undefined }),
      });
      const data = (await res.json().catch(() => null)) as { suggestions?: DomainSuggestion[] } | null;
      setSuggestions(data?.suggestions ?? []);
    } catch {
      setError("Couldn't get suggestions. Try again.");
    } finally {
      setSuggesting(false);
    }
  }

  async function check() {
    setChecking(true);
    setError(null);
    setLookup(null);
    try {
      const res = await fetch("/api/v1/client/website/domain/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: manual.trim() }),
      });
      const data = (await res.json().catch(() => null)) as { result?: DomainLookup; message?: string } | null;
      if (!res.ok) throw new Error(data?.message ?? "Couldn't check that domain.");
      setLookup(data?.result ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't check that domain.");
    } finally {
      setChecking(false);
    }
  }

  async function buy(domain: string) {
    setBuying(domain);
    setError(null);
    try {
      const res = await fetch("/api/v1/client/website/domain/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const data = (await res.json().catch(() => null)) as { domain?: DomainState; message?: string } | null;
      if (!res.ok) throw new Error(data?.message ?? "Could not start the purchase.");
      onDone(data?.domain ?? null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBuying(null);
    }
  }

  return (
    <div className="mt-5">
      <BackLink onClick={onBack} />

      {/* TLD preference + AI suggestions */}
      <div className="mt-3">
        <label className="block text-sm font-medium text-stone-700">Preferred endings</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {TLD_OPTIONS.map((t) => (
            <button
              key={t}
              onClick={() => toggleTld(t)}
              className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
                tlds.includes(t) ? "border-amber-400 bg-amber-100 text-amber-800" : "border-stone-300 text-stone-600 hover:bg-stone-50"
              }`}
            >
              .{t}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Optional keyword (e.g. plumbing, tampa)"
            className="h-11 flex-1 rounded-xl border border-stone-300 px-4 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/40"
          />
          <Button onClick={suggest} disabled={suggesting || !tlds.length} variant="primary">
            <Sparkles size={16} /> {suggesting ? "Finding…" : "Suggest names"}
          </Button>
        </div>
      </div>

      {suggestions && (
        <div className="mt-4">
          {suggestions.length === 0 ? (
            <p className="text-sm text-stone-400">No available names found — try a different keyword or ending, or check one yourself below.</p>
          ) : (
            <ul className="space-y-2">
              {suggestions.map((s) => (
                <BuyRow key={s.domain} domain={s.domain} buying={buying === s.domain} onBuy={() => buy(s.domain)} />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Manual check */}
      <div className="mt-5 border-t border-stone-100 pt-4">
        <label className="block text-sm font-medium text-stone-700">Or check a specific domain</label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="yourbusiness.com"
            className="h-11 flex-1 rounded-xl border border-stone-300 px-4 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/40"
          />
          <Button onClick={check} disabled={checking || !manual.trim()} variant="outline">
            {checking ? "Checking…" : "Check"}
          </Button>
        </div>
        {lookup && (
          <div className="mt-3">
            {lookup.available && lookup.affordable ? (
              <BuyRow domain={lookup.domain} buying={buying === lookup.domain} onBuy={() => buy(lookup.domain)} />
            ) : (
              <p className="rounded-xl bg-stone-50 p-3 text-sm text-stone-600">
                <span className="font-mono font-medium">{lookup.domain}</span> isn&apos;t available — try another.
              </p>
            )}
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

function BuyRow({ domain, buying, onBuy }: { domain: string; buying: boolean; onBuy: () => void }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 p-3">
      <p className="min-w-0 truncate font-mono font-medium text-stone-800">{domain}</p>
      <Button onClick={onBuy} disabled={buying} variant="primary" size="sm">
        {buying ? "Starting…" : "Get this"}
      </Button>
    </li>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800">
      <ArrowLeft size={14} /> Back
    </button>
  );
}

function StatusRow({
  tone,
  icon,
  title,
  children,
  onRemove,
}: {
  tone: "amber" | "green" | "rose";
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  onRemove: () => void;
}) {
  const tones = { amber: "bg-amber-50 text-amber-800", green: "bg-green-50 text-green-800", rose: "bg-rose-50 text-rose-800" } as const;
  return (
    <div className="mt-5">
      <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${tones[tone]}`}>{icon} {title}</div>
      {children && <div className="mt-2 text-sm text-stone-600">{children}</div>}
      <button onClick={onRemove} className="mt-3 text-sm text-stone-400 hover:text-stone-700">Remove domain</button>
    </div>
  );
}

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
          <tr><th className="px-4 py-2 font-medium">Type</th><th className="px-4 py-2 font-medium">Name / Host</th><th className="px-4 py-2 font-medium">Value</th></tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="px-4 py-2 font-mono text-stone-700">{r.type}</td>
              <td className="px-4 py-2 font-mono text-stone-700">{r.name}</td>
              <td className="px-4 py-2"><CopyValue value={r.value} /></td>
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
