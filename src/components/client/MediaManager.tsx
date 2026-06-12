"use client";

import * as React from "react";
import type { MediaItemDTO } from "@/lib/modules/media";

/** The client's reusable media library: upload new images and remove old ones. */
export function MediaManager({ initial }: { initial: MediaItemDTO[] }) {
  const [items, setItems] = React.useState<MediaItemDTO[]>(initial);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="w-fit cursor-pointer rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600">
          {uploading ? "Uploading…" : "Upload images"}
          <input type="file" accept="image/*" multiple onChange={onUpload} disabled={uploading} className="hidden" />
        </label>
        <span className="text-sm text-stone-500">{items.length} image{items.length === 1 ? "" : "s"}</span>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {items.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-10 text-center text-sm text-stone-400">
          No images yet. Upload photos here to reuse them on your website — like a gallery, hero, or services.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {items.map((m) => (
            <div key={m.id} className="group relative overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt={m.alt ?? m.name ?? ""} loading="lazy" className="aspect-square w-full object-cover" />
              <button
                type="button"
                onClick={() => remove(m.id)}
                className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-stone-900/80 text-sm text-white opacity-0 transition group-hover:opacity-100"
                aria-label="Delete image"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
