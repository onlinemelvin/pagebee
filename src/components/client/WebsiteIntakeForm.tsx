"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Phase = "idle" | "working" | "error";

const TONES = [
  "Friendly & professional",
  "Warm & welcoming",
  "Bold & modern",
  "Elegant & luxurious",
  "Playful & fun",
  "Trustworthy & calm",
  "Minimal & clean",
];

const PALETTES: { key: string; name: string; colors: string[] }[] = [
  { key: "auto", name: "Let AI choose", colors: [] },
  { key: "sand", name: "Warm Sand", colors: ["#f59e0b", "#78716c", "#fffbeb"] },
  { key: "ocean", name: "Ocean", colors: ["#0ea5e9", "#14b8a6", "#0f172a"] },
  { key: "forest", name: "Forest", colors: ["#16a34a", "#065f46", "#f0fdf4"] },
  { key: "charcoal", name: "Charcoal", colors: ["#111827", "#6b7280", "#f9fafb"] },
  { key: "rose", name: "Rose", colors: ["#e11d48", "#fb7185", "#fff1f2"] },
  { key: "royal", name: "Royal", colors: ["#4f46e5", "#7c3aed", "#eef2ff"] },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Hour = { day: string; closed: boolean; open: string; close: string };

export function WebsiteIntakeForm({
  submitLabel = "Generate my website",
  maxPages = 5,
  canBook = false,
}: {
  submitLabel?: string;
  maxPages?: number;
  canBook?: boolean;
}) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<{ about?: boolean; services?: boolean }>({});
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Field state
  const [services, setServices] = React.useState<string[]>([]);
  const [serviceAreas, setServiceAreas] = React.useState<string[]>([]);
  const [palette, setPalette] = React.useState("auto");
  const [pages, setPages] = React.useState<Set<string>>(new Set(["home", "about", "services", "contact"]));
  const [hours, setHours] = React.useState<Hour[]>(() =>
    DAYS.map((d) => ({ day: d, closed: d === "Sat" || d === "Sun", open: "09:00", close: "17:00" })),
  );
  const [logoUrl, setLogoUrl] = React.useState<string | null>(null);
  const [imageUrls, setImageUrls] = React.useState<string[]>([]);
  const [uploading, setUploading] = React.useState(false);

  const PAGE_CATALOG = [
    { key: "home", label: "Home", always: true },
    { key: "about", label: "About Us" },
    { key: "services", label: "Services" },
    { key: "contact", label: "Contact Us" },
    { key: "gallery", label: "Gallery" },
    { key: "pricing", label: "Pricing" },
    { key: "faq", label: "FAQ" },
    { key: "testimonials", label: "Testimonials" },
    { key: "team", label: "Team" },
    ...(canBook ? [{ key: "booking", label: "Book Online" }] : []),
  ];

  // ── Background generation polling (unchanged) ──
  const stopPolling = React.useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const checkOnce = React.useCallback(async (): Promise<"working" | "done" | "failed" | "none"> => {
    try {
      const res = await fetch("/api/v1/client/website/generate", { cache: "no-store" });
      if (!res.ok) return "none";
      const { job } = (await res.json()) as { job: { status: string } | null };
      if (!job) return "none";
      if (job.status === "QUEUED" || job.status === "GENERATING") return "working";
      if (job.status === "FAILED") return "failed";
      return "done";
    } catch {
      return "none";
    }
  }, []);

  const startPolling = React.useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setInterval(async () => {
      const s = await checkOnce();
      if (s === "done") {
        stopPolling();
        setPhase("idle");
        router.refresh();
      } else if (s === "failed") {
        stopPolling();
        setError("Generation failed. Please try again.");
        setPhase("error");
      }
    }, 4000);
  }, [checkOnce, router, stopPolling]);

  React.useEffect(() => {
    (async () => {
      if ((await checkOnce()) === "working") {
        setPhase("working");
        startPolling();
      }
    })();
    return stopPolling;
  }, [checkOnce, startPolling, stopPolling]);

  // ── Uploads ──
  async function uploadFile(file: File): Promise<string | null> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/v1/client/uploads", { method: "POST", body: fd });
    if (!res.ok) return null;
    const { url } = (await res.json()) as { url?: string };
    return url ?? null;
  }

  async function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const url = await uploadFile(file);
    if (url) setLogoUrl(url);
    else setError("Logo upload failed — try a smaller image.");
    setUploading(false);
    e.target.value = "";
  }

  async function onImagesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    for (const f of files) {
      const url = await uploadFile(f);
      if (url) setImageUrls((prev) => [...prev, url]);
    }
    setUploading(false);
    e.target.value = "";
  }

  function togglePage(key: string) {
    setPages((prev) => {
      if (key === "home") return prev;
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < maxPages) next.add(key);
      return next;
    });
  }

  function updateHour(i: number, patch: Partial<Hour>) {
    setHours((prev) => prev.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    const about = String(data.get("about") ?? "").trim();
    const tone = String(data.get("tone") ?? "").trim() || undefined;
    const customInstructions = String(data.get("customInstructions") ?? "").trim() || undefined;

    const errs = { about: !about, services: services.length === 0 };
    if (errs.about || errs.services) {
      setFieldErrors(errs);
      setError("Please complete the required fields (About and Services).");
      return;
    }
    setFieldErrors({});

    const chosen = PALETTES.find((p) => p.key === palette);
    const colorPalette = chosen && chosen.key !== "auto" ? `${chosen.name} (${chosen.colors.join(", ")})` : undefined;
    const pagesArr = PAGE_CATALOG.filter((p) => pages.has(p.key)).map((p) => p.label);

    setPhase("working");
    try {
      const res = await fetch("/api/v1/client/website/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          about,
          services,
          serviceAreas: serviceAreas.length ? serviceAreas : undefined,
          tone,
          colorPalette,
          pages: pagesArr,
          businessHours: hours,
          logoUrl: logoUrl ?? undefined,
          imageUrls: imageUrls.length ? imageUrls : undefined,
          customInstructions,
        }),
      });
      if (res.status !== 202 && !res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(b?.error ?? `Failed (${res.status})`);
      }
      startPolling();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("error");
    }
  }

  if (phase === "working") {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-8 text-center">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-amber-300 border-t-amber-600" />
        <p className="font-medium text-stone-900">Generating your website…</p>
        <p className="mt-1 text-sm text-stone-600">
          This runs in the background and can take a minute. You can safely close this page — it&apos;ll
          be here for review when it&apos;s ready.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6">
      <p className="text-xs text-stone-400">
        Fields marked <span className="text-red-500">*</span> are required.
      </p>

      {/* About — required */}
      <div className="grid gap-2">
        <Label htmlFor="about">
          About your business <span className="text-red-500">*</span>
        </Label>
        <Textarea
          id="about"
          name="about"
          className={cn(fieldErrors.about && "border-red-400")}
          placeholder="What you do, who you serve, what makes you different…"
        />
      </div>

      {/* Services — required pills */}
      <div className="grid gap-2">
        <Label htmlFor="services">
          Services <span className="text-red-500">*</span>{" "}
          <span className="font-normal text-stone-400">— type and press comma or Enter</span>
        </Label>
        <PillInput
          id="services"
          value={services}
          onChange={setServices}
          invalid={fieldErrors.services}
          placeholder="Deep cleaning, Move-out cleaning, Office cleaning"
        />
      </div>

      {/* Service areas — pills */}
      <div className="grid gap-2">
        <Label htmlFor="serviceAreas">Service areas</Label>
        <PillInput
          id="serviceAreas"
          value={serviceAreas}
          onChange={setServiceAreas}
          placeholder="Austin, Round Rock, Cedar Park"
        />
      </div>

      {/* Tone — dropdown */}
      <div className="grid gap-2">
        <Label htmlFor="tone">Tone</Label>
        <select
          id="tone"
          name="tone"
          defaultValue=""
          className="h-10 rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900"
        >
          <option value="">Let AI choose</option>
          {TONES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Color palette */}
      <div className="grid gap-2">
        <Label>Color palette</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PALETTES.map((p) => (
            <button
              type="button"
              key={p.key}
              onClick={() => setPalette(p.key)}
              className={cn(
                "flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-left text-sm",
                palette === p.key ? "border-amber-400 ring-2 ring-amber-200" : "border-stone-200 hover:border-stone-300",
              )}
            >
              <span className="flex -space-x-1">
                {p.colors.length ? (
                  p.colors.map((c) => (
                    <span key={c} className="h-4 w-4 rounded-full border border-white" style={{ background: c }} />
                  ))
                ) : (
                  <span className="grid h-4 w-4 place-items-center text-xs">✨</span>
                )}
              </span>
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Pages — plan-gated */}
      <div className="grid gap-2">
        <Label>
          Pages <span className="font-normal text-stone-400">— your plan includes up to {maxPages}</span>
        </Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PAGE_CATALOG.map((p) => {
            const checked = pages.has(p.key);
            const atLimit = !checked && pages.size >= maxPages;
            return (
              <label
                key={p.key}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                  checked ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-white",
                  (p.always || atLimit) && "opacity-70",
                  atLimit ? "cursor-not-allowed" : "cursor-pointer",
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={p.always || atLimit}
                  onChange={() => togglePage(p.key)}
                  className="accent-amber-500"
                />
                {p.label}
                {p.always && <span className="ml-auto text-xs text-stone-400">always</span>}
              </label>
            );
          })}
        </div>
        <p className="text-xs text-stone-400">{pages.size} of {maxPages} selected</p>
      </div>

      {/* Business hours — calendar-like */}
      <div className="grid gap-2">
        <Label>Business hours</Label>
        <div className="overflow-hidden rounded-lg border border-stone-200">
          {hours.map((h, i) => (
            <div key={h.day} className="flex items-center gap-3 border-b border-stone-100 px-3 py-2 last:border-0">
              <span className="w-10 text-sm font-medium text-stone-700">{h.day}</span>
              <label className="flex items-center gap-1.5 text-xs text-stone-500">
                <input
                  type="checkbox"
                  checked={!h.closed}
                  onChange={(e) => updateHour(i, { closed: !e.target.checked })}
                  className="accent-amber-500"
                />
                Open
              </label>
              {h.closed ? (
                <span className="text-sm text-stone-400">Closed</span>
              ) : (
                <span className="flex items-center gap-2 text-sm">
                  <input
                    type="time"
                    value={h.open}
                    onChange={(e) => updateHour(i, { open: e.target.value })}
                    className="rounded border border-stone-300 px-2 py-1"
                  />
                  <span className="text-stone-400">–</span>
                  <input
                    type="time"
                    value={h.close}
                    onChange={(e) => updateHour(i, { close: e.target.value })}
                    className="rounded border border-stone-300 px-2 py-1"
                  />
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Logo */}
      <div className="grid gap-2">
        <Label htmlFor="logo">Logo</Label>
        <div className="flex items-center gap-3">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo preview" className="h-12 w-12 rounded-lg border border-stone-200 object-contain" />
          )}
          <label className="cursor-pointer rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50">
            {logoUrl ? "Replace logo" : "Upload logo"}
            <input id="logo" type="file" accept="image/*" onChange={onLogoChange} className="hidden" />
          </label>
          {logoUrl && (
            <button type="button" onClick={() => setLogoUrl(null)} className="text-sm text-stone-500 hover:text-red-600">
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Custom images */}
      <div className="grid gap-2">
        <Label htmlFor="images">Custom images</Label>
        <label className="w-fit cursor-pointer rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50">
          Add images
          <input id="images" type="file" accept="image/*" multiple onChange={onImagesChange} className="hidden" />
        </label>
        {imageUrls.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-2">
            {imageUrls.map((u, i) => (
              <div key={u} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" className="h-16 w-16 rounded-lg border border-stone-200 object-cover" />
                <button
                  type="button"
                  onClick={() => setImageUrls((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-stone-900 text-xs text-white"
                  aria-label="Remove image"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Custom instructions */}
      <div className="grid gap-2">
        <Label htmlFor="customInstructions">
          Custom instructions <span className="font-normal text-stone-400">— anything else for our AI</span>
        </Label>
        <Textarea
          id="customInstructions"
          name="customInstructions"
          placeholder="e.g. Emphasize that we're family-owned and eco-friendly. Add a section for seasonal promotions. Keep the hero short."
        />
      </div>

      {uploading && <p className="text-sm text-stone-500">Uploading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" size="lg" disabled={uploading}>
        {submitLabel}
      </Button>
    </form>
  );
}

function PillInput({
  id, value, onChange, placeholder, invalid,
}: {
  id?: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  invalid?: boolean;
}) {
  const [draft, setDraft] = React.useState("");

  function commit(raw: string) {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    const merged = [...value];
    for (const p of parts) if (!merged.includes(p)) merged.push(p);
    if (merged.length !== value.length) onChange(merged);
  }

  return (
    <div
      className={cn(
        "flex flex-wrap gap-2 rounded-lg border bg-white p-2",
        invalid ? "border-red-400" : "border-stone-300",
      )}
    >
      {value.map((v, i) => (
        <span key={`${v}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-sm text-amber-900">
          {v}
          <button
            type="button"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            className="text-amber-700 hover:text-amber-900"
            aria-label={`Remove ${v}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => {
          const val = e.target.value;
          if (val.includes(",")) {
            commit(val);
            setDraft("");
          } else {
            setDraft(val);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(draft);
            setDraft("");
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => {
          if (draft.trim()) {
            commit(draft);
            setDraft("");
          }
        }}
        placeholder={value.length ? "" : placeholder}
        className="min-w-[140px] flex-1 border-0 bg-transparent p-1 text-sm outline-none"
      />
    </div>
  );
}
