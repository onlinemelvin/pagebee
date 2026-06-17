"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Trash2, ImageOff, Image as ImageIcon, EyeOff, Lock } from "lucide-react";
import type { MediaItemDTO } from "@/lib/modules/media";
import { toggleFeature } from "@/app/(client)/client/_actions/features";

interface MediaManagerProps {
  initial: MediaItemDTO[];
  galleryEnabled: boolean;
  galleryLocked: boolean;
  galleryBlockedReason: string | null;
}

/** The client's reusable media library: upload images, remove them, and curate the photo gallery. */
export function MediaManager({ initial, galleryEnabled, galleryLocked, galleryBlockedReason }: MediaManagerProps) {
  const router = useRouter();
  const [items, setItems] = React.useState<MediaItemDTO[]>(initial);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savingGallery, setSavingGallery] = React.useState(false);

  // Optimistic override for the gallery switch. The switch and the Website-page feature card both
  // write the same `gallery` feature flag, so they share state; this mirrors FeatureCards' pattern
  // (flip instantly, refresh so the server prop catches up, then drop the override once it matches —
  // or revert on failure) to keep the two in sync.
  const [galleryOverride, setGalleryOverride] = React.useState<boolean | null>(null);
  const galleryOn = galleryOverride ?? galleryEnabled;
  React.useEffect(() => {
    setGalleryOverride((o) => (o === galleryEnabled ? null : o));
  }, [galleryEnabled]);

  // Reconcile against the authoritative DB value on mount. The RSC Router Cache can serve a stale
  // prefetched copy of this page after the gallery was toggled on another page (e.g. the Website
  // feature card), so this `fetch` (no-store, bypasses that cache) corrects the switch if needed.
  React.useEffect(() => {
    let active = true;
    fetch("/api/v1/client/features", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data?.features) return;
        const g = data.features.find((f: { key: string }) => f.key === "gallery");
        if (!g) return;
        const fresh = g.state === "enabled";
        setGalleryOverride((o) => (fresh === galleryEnabled ? o : fresh));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    setError(null);
    for (const f of files) {
      const fd = new FormData();
      fd.append("file", f);
      try {
        const res = await fetch("/api/v1/client/media", { method: "POST", body: fd });
        if (!res.ok) throw new Error(String(res.status));
        const { item } = (await res.json()) as { item: MediaItemDTO };
        setItems((prev) => [item, ...prev]);
      } catch {
        setError("Some images failed to upload — try smaller files (max 5MB).");
      }
    }
    setUploading(false);
    e.target.value = "";
  }

  async function remove(id: string) {
    const prev = items;
    setItems((p) => p.filter((m) => m.id !== id)); // optimistic
    const res = await fetch(`/api/v1/client/media/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setItems(prev); // revert
      setError("Couldn't delete that image. Please try again.");
    }
  }

  async function toggleInGallery(id: string, next: boolean) {
    const prev = items;
    setItems((p) => p.map((m) => (m.id === id ? { ...m, inGallery: next } : m))); // optimistic
    const res = await fetch(`/api/v1/client/media/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inGallery: next }),
    });
    if (!res.ok) {
      setItems(prev); // revert
      setError("Couldn't update that image. Please try again.");
    }
  }

  async function toggleGallery() {
    if (galleryLocked || savingGallery) return;
    const next = !galleryOn;
    setSavingGallery(true);
    setError(null);
    setGalleryOverride(next); // flip now
    try {
      // Server Action (not a fetch): its revalidatePath evicts the Website page's cached copy too,
      // so the feature card there reflects this toggle without a hard reload.
      const res = await toggleFeature("gallery", next);
      if (!res.ok) throw new Error(res.message ?? "Couldn't update the gallery setting.");
      router.refresh(); // current page's prop catches up; the reconcile effect drops the override
    } catch (err) {
      setGalleryOverride(null); // revert to the server value
      setError(err instanceof Error ? err.message : "Couldn't update the gallery setting.");
    }
    setSavingGallery(false);
  }

  const photos = items.filter((m) => m.kind === "image");
  const galleryCount = photos.filter((m) => m.inGallery).length;

  return (
    <div>
      {/* Gallery master switch */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-stone-50/60 px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-9 w-9 place-items-center rounded-xl bg-white text-amber-600 shadow-sm">
            <ImageIcon size={18} />
          </span>
          <div>
            <p className="font-display text-base text-stone-900">Show photo gallery on my website</p>
            <p className="text-sm text-stone-500">
              {galleryLocked
                ? "Available on a higher plan."
                : galleryOn
                  ? `Showing ${galleryCount} photo${galleryCount === 1 ? "" : "s"} from your library.`
                  : "Your gallery section is hidden from visitors."}
            </p>
            {galleryLocked && galleryBlockedReason && (
              <p className="mt-1 text-xs text-stone-400">{galleryBlockedReason}</p>
            )}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={galleryOn}
          aria-label="Show photo gallery on my website"
          onClick={toggleGallery}
          disabled={galleryLocked || savingGallery}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${
            galleryOn ? "bg-amber-500" : "bg-stone-300"
          }`}
        >
          {galleryLocked ? (
            <Lock size={12} className="mx-auto text-white" />
          ) : (
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                galleryOn ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          )}
        </button>
      </div>

      {/* Dropzone */}
      <label className="mt-6 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 bg-white px-6 py-10 text-center transition hover:border-amber-300 hover:bg-amber-50/40">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-b from-amber-200/70 to-amber-50 text-amber-600 shadow-sm">
          <UploadCloud size={24} />
        </span>
        <span className="font-display text-lg text-stone-900">{uploading ? "Uploading…" : "Upload images"}</span>
        <span className="text-sm text-stone-500">Click to browse or drop files here · JPG/PNG up to 5MB each</span>
        <input type="file" accept="image/*" multiple onChange={onUpload} disabled={uploading} className="hidden" />
      </label>
      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm text-stone-500">{items.length} image{items.length === 1 ? "" : "s"}</span>
        {galleryOn && photos.length > 0 && (
          <span className="text-sm text-stone-400">{galleryCount} in gallery</span>
        )}
      </div>

      {items.length === 0 && !uploading ? (
        <div className="mt-2 flex flex-col items-center rounded-2xl border border-dashed border-stone-200 bg-stone-50/60 px-6 py-10 text-center text-stone-400">
          <ImageOff size={26} />
          <p className="mt-2 max-w-xs text-sm">Your library is empty. Upload photos once and reuse them across your website — gallery, hero, and services.</p>
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {uploading && <div className="skeleton aspect-square w-full rounded-xl" />}
          {items.map((m) => {
            const isPhoto = m.kind === "image";
            const inGallery = isPhoto && m.inGallery;
            return (
              <div key={m.id} className="group anim-rise relative overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.url}
                  alt={m.alt ?? m.name ?? ""}
                  loading="lazy"
                  className={`aspect-square w-full object-cover transition group-hover:scale-105 ${
                    isPhoto && !inGallery ? "opacity-60" : ""
                  }`}
                />
                {/* Per-image gallery toggle (photos only) */}
                {isPhoto && (
                  <button
                    type="button"
                    onClick={() => toggleInGallery(m.id, !inGallery)}
                    className={`absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium backdrop-blur-sm transition ${
                      inGallery
                        ? "bg-amber-500/90 text-white opacity-90 hover:bg-amber-600"
                        : "bg-stone-900/65 text-white opacity-0 hover:bg-stone-900/85 group-hover:opacity-100"
                    }`}
                    aria-pressed={inGallery}
                    aria-label={inGallery ? "Remove from gallery" : "Add to gallery"}
                  >
                    {inGallery ? <ImageIcon size={12} /> : <EyeOff size={12} />}
                    {inGallery ? "In gallery" : "Hidden"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(m.id)}
                  className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full bg-stone-900/75 text-white opacity-0 backdrop-blur-sm transition hover:bg-rose-600 group-hover:opacity-100"
                  aria-label="Delete image"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
