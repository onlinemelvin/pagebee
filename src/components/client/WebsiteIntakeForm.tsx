"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/brand/Logo";
import { LEAD_GOALS } from "@/lib/site/lead-goals";

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

// Primary call-to-action options (form-enabled plans only). The label is sent verbatim
// as `primaryGoal` and steers the generated form's heading, fields, and lead `type`. The same
// canonical list is reused on the Inquiries page so the owner can change it after launch.
const GOALS = LEAD_GOALS;

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Hour = { day: string; closed: boolean; open: string; close: string };

// Draft persistence for the long "about" text — survives refreshes/navigation via localStorage.
const ABOUT_DRAFT_KEY = "pagebee:intake:about";

// Dev-only quick-fill for testing generation. Text is intentionally left as typed (typos and all)
// to exercise the AI's spelling/grammar cleanup. Shown only outside production.
const TEST_PREFILL = {
  about:
    "A family owned mobile auto-repair shop. We come to you to repair your car. For more serious matters, we drive it to our garrage, repair it and bring it back. We also tow if your car is not drivable",
  services: ["Tire rotation", "oil change", "engine repair", "flat tires", "auto-detailing", "car wash", "paint job"],
  serviceAreas: ["Greater Tampa area"],
  customInstructions:
    "Please emphasize the fact that even though we are a family owned business, we price competitvely",
};

interface PricingRow { name: string; price: string }
interface FaqRow { q: string; a: string }
interface TeamRow { name: string; role: string; photoUrl: string }

const inputCls =
  "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-100";

export function WebsiteIntakeForm({
  submitLabel = "Generate my website",
  maxPages = 5,
  canBook = false,
  canUseForms = true,
  contactDefaults,
  onSubmit,
  uploadUrl = "/api/v1/client/uploads",
  mediaUrl = "/api/v1/client/media",
  faqUrl = "/api/v1/client/website/faq-suggest",
  uploadFields,
  draftKey = ABOUT_DRAFT_KEY,
  footerNote = "Free preview · no charge until you approve & launch",
}: {
  submitLabel?: string;
  maxPages?: number;
  canBook?: boolean;
  /** Whether the plan allows lead-capture forms. When false (Launch), the site shows
   *  click-to-call / email only and we skip the "primary goal" picker. */
  canUseForms?: boolean;
  /** Contact info prefilled into the Contact section (from registration). */
  contactDefaults?: { email?: string; phone?: string };
  /** Override the default client submit (POST to /generate + poll). When provided, the form assembles
   *  the same intake payload and hands it off — used by the rep preview flow, which posts elsewhere and
   *  refreshes its own UI instead of polling. The form shows no in-place "building" view in this mode. */
  onSubmit?: (intake: Record<string, unknown>) => Promise<void>;
  /** Upload endpoint for logo/images/gallery (returns { url }). */
  uploadUrl?: string;
  /** Reusable media-library endpoint (GET list + POST upload). Null disables the "choose from library"
   *  picker and routes gallery uploads through `uploadUrl` — used when no library exists yet (rep preview). */
  mediaUrl?: string | null;
  /** AI FAQ-suggestion endpoint. */
  faqUrl?: string;
  /** Extra multipart fields appended to every upload (e.g. { prospectId } for rep uploads). */
  uploadFields?: Record<string, string>;
  /** localStorage key for persisting the "about" draft. Null disables persistence (rep preview, where
   *  the draft would otherwise leak between prospects). */
  draftKey?: string | null;
  /** Small reassurance line under the submit button. */
  footerNote?: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<{ about?: boolean; services?: boolean }>({});
  // The "about" field is controlled so we can persist its draft locally (restored on mount).
  const [aboutDraft, setAboutDraft] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  React.useEffect(() => {
    if (!draftKey) return;
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) setAboutDraft(saved);
    } catch {}
  }, [draftKey]);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Field state
  const [services, setServices] = React.useState<string[]>([]);
  const [serviceAreas, setServiceAreas] = React.useState<string[]>([]);
  const [customInstructions, setCustomInstructions] = React.useState("");
  const [palette, setPalette] = React.useState("auto");
  // Default selection, capped to the plan's page allowance. Priority order ensures a 3-page plan
  // (Launch) still gets a complete minimal site — Home / Services / Contact — rather than overflowing.
  const [pages, setPages] = React.useState<Set<string>>(
    () => new Set(["home", "services", "contact", "about"].slice(0, maxPages)),
  );
  const [hours, setHours] = React.useState<Hour[]>(() =>
    DAYS.map((d) => ({ day: d, closed: d === "Sat" || d === "Sun", open: "09:00", close: "17:00" })),
  );
  const [logoUrl, setLogoUrl] = React.useState<string | null>(null);
  const [imageUrls, setImageUrls] = React.useState<string[]>([]);
  const [uploading, setUploading] = React.useState(false);
  // Gallery photos (when the Gallery page/section is selected). These persist to the
  // client's reusable media library so they can be picked again later.
  const [galleryImages, setGalleryImages] = React.useState<string[]>([]);
  const [library, setLibrary] = React.useState<{ id: string; url: string; alt: string | null }[] | null>(null);
  const [showLibrary, setShowLibrary] = React.useState(false);
  const galleryOn = pages.has("gallery");
  const contactOn = pages.has("contact");
  const pricingOn = pages.has("pricing");
  const faqOn = pages.has("faq");
  const teamOn = pages.has("team");

  // Per-section inputs (shown when the matching page/section is selected).
  const [contact, setContact] = React.useState({
    email: contactDefaults?.email ?? "",
    phone: contactDefaults?.phone ?? "",
    address: "",
  });
  const [pricing, setPricing] = React.useState<PricingRow[]>([]);
  const [faqs, setFaqs] = React.useState<FaqRow[]>([]);
  const [team, setTeam] = React.useState<TeamRow[]>([]);
  const [faqLoading, setFaqLoading] = React.useState(false);

  // Prefill pricing from the services list the first time Pricing is turned on.
  const pricingSeeded = React.useRef(false);
  React.useEffect(() => {
    if (pricingOn && !pricingSeeded.current && services.length) {
      setPricing(services.map((name) => ({ name, price: "" })));
      pricingSeeded.current = true;
    }
  }, [pricingOn, services]);

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
        // Keep showing the "we're building your site" holding view (phase stays "working") and let
        // the server refresh swap this form out for the page's awaiting-review holding state. Do
        // NOT flip back to "idle" first — that briefly re-renders the questionnaire before the
        // refresh lands, which is the flicker (working → form → holding state).
        router.refresh();
      } else if (s === "failed") {
        stopPolling();
        setError("Generation failed. Please try again.");
        setPhase("error");
      }
    }, 4000);
  }, [checkOnce, router, stopPolling]);

  React.useEffect(() => {
    // Resume polling only in the default client flow — the rep flow (onSubmit) has no client job to poll.
    if (onSubmit) return;
    (async () => {
      if ((await checkOnce()) === "working") {
        setPhase("working");
        startPolling();
      }
    })();
    return stopPolling;
  }, [checkOnce, startPolling, stopPolling, onSubmit]);

  // ── Uploads ──
  async function uploadFile(file: File): Promise<string | null> {
    const fd = new FormData();
    fd.append("file", file);
    for (const [k, v] of Object.entries(uploadFields ?? {})) fd.append(k, v);
    const res = await fetch(uploadUrl, { method: "POST", body: fd });
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

  // Gallery photos. With a media library (client), they upload there so they're saved for reuse; without
  // one (rep preview), they go through the plain upload endpoint and are just attached to this preview.
  async function onGalleryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    for (const f of files) {
      if (!mediaUrl) {
        const url = await uploadFile(f);
        if (url) setGalleryImages((prev) => (prev.includes(url) ? prev : [...prev, url]));
        else setError("A gallery image failed to upload — try a smaller file (max 5MB).");
        continue;
      }
      const fd = new FormData();
      fd.append("file", f);
      try {
        const res = await fetch(mediaUrl, { method: "POST", body: fd });
        if (!res.ok) throw new Error(String(res.status));
        const { item } = (await res.json()) as { item: { id: string; url: string; alt: string | null } };
        setGalleryImages((prev) => (prev.includes(item.url) ? prev : [...prev, item.url]));
        setLibrary((prev) => (prev ? [item, ...prev] : prev));
      } catch {
        setError("A gallery image failed to upload — try a smaller file (max 5MB).");
      }
    }
    setUploading(false);
    e.target.value = "";
  }

  async function toggleLibrary() {
    if (!mediaUrl) return;
    const next = !showLibrary;
    setShowLibrary(next);
    if (next && library === null) {
      try {
        const res = await fetch(mediaUrl, { cache: "no-store" });
        const { items } = (await res.json()) as { items: { id: string; url: string; alt: string | null }[] };
        setLibrary(items ?? []);
      } catch {
        setLibrary([]);
      }
    }
  }

  function toggleGalleryUrl(url: string) {
    setGalleryImages((prev) => (prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]));
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

  // Pricing rows
  const addPricing = () => setPricing((p) => [...p, { name: "", price: "" }]);
  const updatePricing = (i: number, patch: Partial<PricingRow>) =>
    setPricing((p) => p.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const removePricing = (i: number) => setPricing((p) => p.filter((_, j) => j !== i));

  // FAQ rows
  const addFaq = () => setFaqs((f) => [...f, { q: "", a: "" }]);
  const updateFaq = (i: number, patch: Partial<FaqRow>) =>
    setFaqs((f) => f.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const removeFaq = (i: number) => setFaqs((f) => f.filter((_, j) => j !== i));

  async function generateFaqs() {
    setFaqLoading(true);
    setError(null);
    try {
      const res = await fetch(faqUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ about: aboutDraft, services }),
      });
      if (res.ok) {
        const { faqs: gen } = (await res.json()) as { faqs: FaqRow[] };
        setFaqs((prev) => [...prev, ...gen.map((f) => ({ q: f.q, a: f.a }))]);
      } else if (res.status === 503) {
        setError("AI FAQ suggestions aren't available right now — you can add them manually.");
      } else {
        setError("Couldn't generate FAQs — try again, or add them manually.");
      }
    } catch {
      setError("Couldn't generate FAQs — try again, or add them manually.");
    } finally {
      setFaqLoading(false);
    }
  }

  // Team rows
  const addTeam = () => setTeam((t) => [...t, { name: "", role: "", photoUrl: "" }]);
  const updateTeam = (i: number, patch: Partial<TeamRow>) =>
    setTeam((t) => t.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const removeTeam = (i: number) => setTeam((t) => t.filter((_, j) => j !== i));
  async function uploadTeamPhoto(i: number, file: File) {
    setUploading(true);
    const url = await uploadFile(file);
    if (url) updateTeam(i, { photoUrl: url });
    else setError("Photo upload failed — try a smaller image.");
    setUploading(false);
  }

  // Dev-only: fill the core fields with a known sample so generation is quick to test.
  function prefillTestData() {
    setAboutDraft(TEST_PREFILL.about);
    try {
      if (draftKey) localStorage.setItem(draftKey, TEST_PREFILL.about);
    } catch {}
    setServices(TEST_PREFILL.services);
    setServiceAreas(TEST_PREFILL.serviceAreas);
    setCustomInstructions(TEST_PREFILL.customInstructions);
    setFieldErrors({});
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    const about = String(data.get("about") ?? "").trim();
    const tone = String(data.get("tone") ?? "").trim() || undefined;
    const primaryGoal = canUseForms ? String(data.get("primaryGoal") ?? "").trim() || undefined : undefined;
    const customInstructions = String(data.get("customInstructions") ?? "").trim() || undefined;
    const knowledgeDetails = String(data.get("knowledgeDetails") ?? "").trim() || undefined;

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

    // The complete intake payload — identical in both flows (client self-serve and rep preview).
    const payload = {
      about,
      services,
      serviceAreas: serviceAreas.length ? serviceAreas : undefined,
      tone,
      primaryGoal,
      colorPalette,
      pages: pagesArr,
      businessHours: hours,
      logoUrl: logoUrl ?? undefined,
      imageUrls: imageUrls.length ? imageUrls : undefined,
      galleryImageUrls: galleryOn && galleryImages.length ? galleryImages : undefined,
      contact: contactOn
        ? {
            email: contact.email.trim() || undefined,
            phone: contact.phone.trim() || undefined,
            address: contact.address.trim() || undefined,
          }
        : undefined,
      pricing: (() => {
        if (!pricingOn) return undefined;
        const rows = pricing.filter((p) => p.name.trim()).map((p) => ({ name: p.name.trim(), price: p.price.trim() || undefined }));
        return rows.length ? rows : undefined;
      })(),
      faqs: (() => {
        if (!faqOn) return undefined;
        const rows = faqs.filter((f) => f.q.trim() && f.a.trim()).map((f) => ({ q: f.q.trim(), a: f.a.trim() }));
        return rows.length ? rows : undefined;
      })(),
      team: (() => {
        if (!teamOn) return undefined;
        const rows = team.filter((m) => m.name.trim()).map((m) => ({ name: m.name.trim(), role: m.role.trim() || undefined, photoUrl: m.photoUrl || undefined }));
        return rows.length ? rows : undefined;
      })(),
      customInstructions,
      knowledgeDetails,
    };
    const clearDraft = () => {
      try {
        if (draftKey) localStorage.removeItem(draftKey);
      } catch {}
    };

    // Rep preview flow: the caller submits + drives its own post-submit UI (refresh). No in-place
    // "building" view and no polling — the form stays put until the parent refresh unmounts it.
    if (onSubmit) {
      setSubmitting(true);
      try {
        await onSubmit(payload);
        clearDraft();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setPhase("working");
    try {
      const res = await fetch("/api/v1/client/website/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status !== 202 && !res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(b?.error ?? `Failed (${res.status})`);
      }
      // Submitted successfully → clear the saved draft so it doesn't linger.
      clearDraft();
      startPolling();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("error");
    }
  }

  if (phase === "working") {
    return (
      <div className="anim-rise rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 p-8 text-center shadow-card">
        <span className="pulse-dot mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-white shadow-sm"><LogoMark size={32} /></span>
        <p className="font-display text-xl text-stone-900">We&apos;re setting up your website</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-stone-600">
          Thanks! Our team is putting your site together. This can take up to 48 hours, though it&apos;s
          usually ready within a few hours. You can safely close this page — please check back later and
          we&apos;ll have your preview ready to review.
        </p>
        <div className="mx-auto mt-5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-amber-200/60">
          <div className="skeleton h-full w-1/2 rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6">
      {process.env.NODE_ENV !== "production" && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-amber-400 bg-amber-50 px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">Testing</span>
          <button
            type="button"
            onClick={prefillTestData}
            className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-700"
          >
            Prefill test data
          </button>
        </div>
      )}

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
          value={aboutDraft}
          onChange={(e) => {
            setAboutDraft(e.target.value);
            try {
              if (draftKey) localStorage.setItem(draftKey, e.target.value);
            } catch {}
          }}
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
        <p className="text-xs text-amber-500">Just a starting point — you can add, edit, or remove services anytime after your site is created.</p>
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
        <Label htmlFor="serviceAreas">
          Service areas <span className="font-normal text-stone-400">— press Enter after each</span>
        </Label>
        <PillInput
          id="serviceAreas"
          value={serviceAreas}
          onChange={setServiceAreas}
          splitOnComma={false}
          placeholder="Tampa, FL · Round Rock · Georgia"
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

      {/* Primary goal / call to action — form-enabled plans only */}
      {canUseForms ? (
        <div className="grid gap-2">
          <Label htmlFor="primaryGoal">
            What should visitors mainly do?{" "}
            <span className="font-normal text-stone-400">— shapes your main form</span>
          </Label>
          <select
            id="primaryGoal"
            name="primaryGoal"
            defaultValue=""
            className="h-10 rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900"
          >
            <option value="">Let AI choose</option>
            {GOALS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
      ) : (
        <p className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-500">
          Your plan shows a click-to-call &amp; email contact section (no forms). Upgrade to add
          lead-capture forms like quote or callback requests.
        </p>
      )}

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

      {/* Pages & sections — plan-gated */}
      <div className="grid gap-2">
        <Label>
          Pages &amp; sections <span className="font-normal text-stone-400">— your plan includes up to {maxPages}</span>
        </Label>
        <p className="text-xs text-stone-400">
          Pick what your site should cover. We&apos;ll lay these out as their own pages or as sections on one
          scrolling page — whichever looks best for your business.
        </p>
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
        <p className="text-xs text-stone-400">{pages.size} of {maxPages} pages &amp; sections selected</p>
      </div>

      {/* Gallery photos — only when Gallery is selected */}
      {galleryOn && (
        <div className="grid gap-2 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <Label>
            Gallery photos{" "}
            <span className="font-normal text-stone-400">— add 4–5 of your best images (you can skip)</span>
          </Label>
          <p className="text-xs text-stone-500">
            {mediaUrl ? (
              <>
                These appear in your Gallery. They&apos;re also saved to your{" "}
                <a href="/client/media" target="_blank" rel="noreferrer" className="font-medium text-amber-700 hover:underline">
                  media library
                </a>{" "}
                so you can reuse or update them later.
              </>
            ) : (
              <>These appear in the Gallery.</>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="w-fit cursor-pointer rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50">
              Upload photos
              <input type="file" accept="image/*" multiple onChange={onGalleryChange} className="hidden" />
            </label>
            {mediaUrl && (
              <button
                type="button"
                onClick={toggleLibrary}
                className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
              >
                {showLibrary ? "Hide library" : "Choose from library"}
              </button>
            )}
            <span className="text-xs text-stone-500">{galleryImages.length} selected</span>
          </div>

          {/* Selected gallery images */}
          {galleryImages.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-2">
              {galleryImages.map((u) => (
                <div key={u} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" className="h-16 w-16 rounded-lg border border-stone-200 object-cover" />
                  <button
                    type="button"
                    onClick={() => toggleGalleryUrl(u)}
                    className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-stone-900 text-xs text-white"
                    aria-label="Remove from gallery"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Library picker */}
          {showLibrary && (
            <div className="mt-2 rounded-lg border border-stone-200 bg-white p-3">
              {library === null ? (
                <p className="text-sm text-stone-400">Loading your library…</p>
              ) : library.length === 0 ? (
                <p className="text-sm text-stone-400">Your library is empty — upload photos above to start.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {library.map((m) => {
                    const on = galleryImages.includes(m.url);
                    return (
                      <button
                        type="button"
                        key={m.id}
                        onClick={() => toggleGalleryUrl(m.url)}
                        className={cn(
                          "relative overflow-hidden rounded-lg border-2",
                          on ? "border-amber-500 ring-2 ring-amber-200" : "border-transparent hover:border-stone-300",
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={m.url} alt={m.alt ?? ""} loading="lazy" className="aspect-square w-full object-cover" />
                        {on && (
                          <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-amber-500 text-xs text-white">
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Contact details — when Contact Us is selected (prefilled from registration) */}
      {contactOn && (
        <div className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <Label>
            Contact details
          </Label>
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} placeholder="Email" type="email" className={inputCls} />
            <input value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} placeholder="Phone" className={inputCls} />
          </div>
          <input value={contact.address} onChange={(e) => setContact({ ...contact, address: e.target.value })} placeholder="Address (optional) — shown in Contact & footer" className={inputCls} />
        </div>
      )}

      {/* Pricing — when Pricing is selected (prefilled from services) */}
      {pricingOn && (
        <div className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <Label>
            Pricing <span className="font-normal text-stone-400">— prefilled from your services; edit, add prices, or add items</span>
          </Label>
          <div className="grid gap-2">
            {pricing.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={row.name} onChange={(e) => updatePricing(i, { name: e.target.value })} placeholder="Item or service" className={cn(inputCls, "flex-1")} />
                <input value={row.price} onChange={(e) => updatePricing(i, { price: e.target.value })} placeholder="$50, from $99…" className={cn(inputCls, "w-32")} />
                <button type="button" onClick={() => removePricing(i)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-red-600" aria-label="Remove item">×</button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addPricing} className="w-fit text-sm font-semibold text-amber-700 hover:text-amber-800">+ Add item</button>
          <p className="text-xs text-stone-400">Leave a price blank to show “price on request”.</p>
        </div>
      )}

      {/* FAQ — when FAQ is selected (manual or AI-generated) */}
      {faqOn && (
        <div className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>FAQ <span className="font-normal text-stone-400">— questions &amp; answers</span></Label>
            <button
              type="button"
              onClick={generateFaqs}
              disabled={faqLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60"
            >
              <Sparkles size={14} /> {faqLoading ? "Generating…" : "Generate with AI"}
            </button>
          </div>
          {faqs.length === 0 && <p className="text-xs text-stone-500">Add your own, or let AI draft a few from your business details — then edit freely.</p>}
          <div className="grid gap-2">
            {faqs.map((f, i) => (
              <div key={i} className="grid gap-1.5 rounded-lg border border-stone-200 bg-white p-3">
                <div className="flex items-center gap-2">
                  <input value={f.q} onChange={(e) => updateFaq(i, { q: e.target.value })} placeholder="Question" className={cn(inputCls, "flex-1 font-medium")} />
                  <button type="button" onClick={() => removeFaq(i)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-red-600" aria-label="Remove question">×</button>
                </div>
                <Textarea rows={2} value={f.a} onChange={(e) => updateFaq(i, { a: e.target.value })} placeholder="Answer" />
              </div>
            ))}
          </div>
          <button type="button" onClick={addFaq} className="w-fit text-sm font-semibold text-amber-700 hover:text-amber-800">+ Add question</button>
        </div>
      )}

      {/* Team — when Team is selected */}
      {teamOn && (
        <div className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <Label>Team <span className="font-normal text-stone-400">— the people customers will meet</span></Label>
          <div className="grid gap-2">
            {team.map((m, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white p-2">
                <label className="grid h-14 w-14 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-lg border border-dashed border-stone-300 bg-stone-50 text-center text-[10px] text-stone-400 hover:bg-stone-100">
                  {m.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.photoUrl} alt={m.name} className="h-full w-full object-cover" />
                  ) : (
                    "Photo"
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadTeamPhoto(i, e.target.files[0])} />
                </label>
                <div className="grid flex-1 gap-1.5 sm:grid-cols-2">
                  <input value={m.name} onChange={(e) => updateTeam(i, { name: e.target.value })} placeholder="Name" className={inputCls} />
                  <input value={m.role} onChange={(e) => updateTeam(i, { role: e.target.value })} placeholder="Role (e.g. Owner)" className={inputCls} />
                </div>
                <button type="button" onClick={() => removeTeam(i)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-red-600" aria-label="Remove member">×</button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addTeam} className="w-fit text-sm font-semibold text-amber-700 hover:text-amber-800">+ Add team member</button>
        </div>
      )}

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
          value={customInstructions}
          onChange={(e) => setCustomInstructions(e.target.value)}
          placeholder="e.g. Emphasize that we're family-owned and eco-friendly. Add a section for seasonal promotions. Keep the hero short."
        />
      </div>

      {/* Knowledge base — facts the AI should know (grounds the copy + powers chat) */}
      <div className="grid gap-2">
        <Label htmlFor="knowledgeDetails">
          What should your AI know? <span className="font-normal text-stone-400">— policies, details, anything customers ask</span>
        </Label>
        <Textarea
          id="knowledgeDetails"
          name="knowledgeDetails"
          rows={5}
          placeholder="e.g. We're open 8–6 Mon–Sat, closed Sundays. Free estimates. 1-year workmanship warranty. We serve the whole metro area within 30 miles. We don't do roofing. Deposits are 50% upfront, refundable up to 48h before."
        />
        <p className="text-xs text-stone-400">
          This trains your website copy and your AI chat assistant. You can upload documents (policies, price lists) and add more anytime in your knowledge base after launch.
        </p>
      </div>

      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="sticky bottom-4 z-10 mt-2 rounded-2xl border border-stone-200 bg-white/90 p-3 shadow-sm backdrop-blur">
        <Button type="submit" size="lg" disabled={uploading || submitting} className="w-full">
          <Sparkles size={18} /> {uploading ? "Uploading images…" : submitting ? "Starting…" : submitLabel}
        </Button>
        <p className="mt-2 text-center text-xs text-stone-400">{footerNote}</p>
      </div>
    </form>
  );
}

function PillInput({
  id, value, onChange, placeholder, invalid, splitOnComma = true,
}: {
  id?: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  invalid?: boolean;
  // When false, commas are kept inside the value (e.g. "Tampa, FL") and pills are only committed
  // on Enter/blur. Defaults to true for simple comma-separated lists like services.
  splitOnComma?: boolean;
}) {
  const [draft, setDraft] = React.useState("");

  function commit(raw: string) {
    const parts = splitOnComma
      ? raw.split(",").map((s) => s.trim()).filter(Boolean)
      : [raw.trim()].filter(Boolean);
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
          if (splitOnComma && val.includes(",")) {
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
