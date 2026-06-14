"use client";

import * as React from "react";
import { Play, X } from "lucide-react";

/**
 * Demo-video player for the pre-site welcome screen. Renders a branded poster card; clicking it
 * opens a lightbox with the actual walkthrough video (NEXT_PUBLIC_DEMO_VIDEO_URL). When no URL is
 * configured the poster stays as a tasteful "coming soon" placeholder so the layout never breaks.
 */
export function DemoVideo({ url }: { url?: string }) {
  const [open, setOpen] = React.useState(false);

  // Close on Escape while the lightbox is open.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const isEmbed = url ? /youtube\.com|youtu\.be|vimeo\.com/.test(url) : false;

  return (
    <>
      <button
        type="button"
        onClick={() => url && setOpen(true)}
        disabled={!url}
        className="group relative block aspect-video w-full overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-100 via-amber-50 to-stone-100 text-left shadow-sm transition hover:shadow-lg disabled:cursor-default"
      >
        {/* Honeycomb texture hint */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 50% 50%, #b45309 1.5px, transparent 1.6px)",
            backgroundSize: "22px 22px",
          }}
        />
        <div className="absolute inset-0 grid place-items-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-white/90 text-amber-700 shadow-md transition-transform duration-200 group-hover:scale-110 motion-reduce:transform-none">
            <Play size={26} className="ml-1 fill-current" />
          </span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-stone-900/55 to-transparent p-4">
          <p className="font-display text-base text-white drop-shadow">Watch the 2-minute tour</p>
          <p className="text-xs text-white/80">
            {url ? "See how your site, inquiries, and bookings work together." : "Walkthrough video coming soon."}
          </p>
        </div>
      </button>

      {open && url && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Product demo video"
          onMouseDown={() => setOpen(false)}
        >
          <div className="relative w-full max-w-4xl" onMouseDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close video"
              className="absolute -top-10 right-0 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            >
              <X size={18} />
            </button>
            <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-2xl">
              {isEmbed ? (
                <iframe
                  src={url}
                  title="PageBee demo"
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <video src={url} controls autoPlay className="h-full w-full">
                  <track kind="captions" />
                </video>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
