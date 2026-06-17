/**
 * Lightweight preview "cover" — a small, light website MOCKUP of the generated site (NOT an
 * iframe / live DOM render, and NOT a pixel screenshot). It mimics a clean light landing page —
 * a nav bar, hero headline + subheadline, CTA buttons, and a hero-image placeholder — using the
 * site's hero copy + business name, with the brand color (extracted from the real HTML) as a
 * small accent. When `href` is set the whole cover is a link with a slight hover lift; its content
 * is non-selectable. Server component, zero infra.
 */
export function PreviewCover({
  businessName,
  accent = "#f59e0b",
  copy,
  href,
  className,
}: {
  businessName: string;
  /** The site's real brand color (extracted from its HTML), used only as a small accent. */
  accent?: string;
  copy?: { heroHeadline?: string; heroSubheadline?: string } | null;
  /** When set, the whole cover becomes a link (opens in a new tab) with a hover lift. */
  href?: string;
  className?: string;
}) {
  const headline = copy?.heroHeadline?.trim() || businessName;

  const inner = (
    <>
      {/* Nav bar */}
      <div className="flex items-center justify-between border-b border-stone-100 px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: accent }} />
          <span className="truncate text-[8px] font-bold text-stone-800">{businessName}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="h-1 w-4 rounded-full bg-stone-200" />
          <span className="h-1 w-4 rounded-full bg-stone-200" />
          <span className="rounded-full px-1.5 py-0.5 text-[7px] font-bold text-white" style={{ background: accent }}>
            Call
          </span>
        </div>
      </div>

      {/* Hero */}
      <div className="flex items-center gap-3 px-3 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[13px] font-bold leading-tight text-stone-900 line-clamp-2">{headline}</h3>
          {copy?.heroSubheadline && (
            <p className="mt-1 text-[8px] leading-snug text-stone-500 line-clamp-2">{copy.heroSubheadline}</p>
          )}
          <div className="mt-2.5 flex items-center gap-1.5">
            <span className="rounded-full px-2.5 py-1 text-[7px] font-bold text-white" style={{ background: accent }}>
              Get a quote
            </span>
            <span className="rounded-full border border-stone-300 px-2 py-1 text-[7px] font-semibold text-stone-600">
              Services
            </span>
          </div>
        </div>
        {/* Hero image placeholder */}
        <div className="grid h-14 w-16 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-stone-100 to-stone-200">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#a8a29e" strokeWidth="1.5">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="8.5" cy="9.5" r="1.5" />
            <path d="m21 16-5-5-9 9" />
          </svg>
        </div>
      </div>

      {/* Soft mask + "Preview" watermark — this is an approximation, not the real rendered site.
          The mask lightens slightly on hover to hint the cover is interactive. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/65 backdrop-blur-[2px] transition-colors duration-200 group-hover:bg-white/45">
        <span className="select-none font-display text-base font-extrabold uppercase tracking-[0.35em] text-stone-900/55">
          Preview
        </span>
      </div>
    </>
  );

  const base = `group relative block aspect-[16/10] w-full select-none overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition duration-200 ${className ?? ""}`;

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        aria-label="View website preview"
        className={`${base} cursor-pointer hover:-translate-y-0.5 hover:shadow-md`}
      >
        {inner}
      </a>
    );
  }

  return (
    <div aria-label="Website preview" className={base}>
      {inner}
    </div>
  );
}
