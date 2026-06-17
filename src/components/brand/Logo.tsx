import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

// Aspect ratio of the logo art (matches the 574×800 source), kept small so the
// image optimizer serves icon-sized variants rather than full-res ones.
// `width: auto` below means the real file's ratio always wins, so the mark
// never distorts even if the logo is swapped for a different shape.
const LOGO_W = 108;
const LOGO_H = 150;

/**
 * The PageBee logo mark — the bee image from /public/logo, on its own
 * transparent background (no colored box; the artwork is self-contained).
 * `size` is the rendered height in px; width scales to keep aspect ratio.
 */
export function LogoMark({
  size = 32,
  className,
  priority = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/logo/pagebee-logo.png"
      alt="PageBee"
      width={LOGO_W}
      height={LOGO_H}
      priority={priority}
      style={{ height: size, width: "auto" }}
      className={cn("object-contain", className)}
    />
  );
}

/**
 * The PageBee wordmark — "Page" in ink, "Bee" in brand amber, set in the
 * rounded brand font.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-brand font-bold leading-none tracking-tight", className)}>
      <span className="text-stone-900">Page</span>
      <span className="text-brand-amber">Bee</span>
    </span>
  );
}

/**
 * Full lockup: logo mark + wordmark. Renders as a link when `href` is given.
 *
 * - `size`      — logo mark pixel size
 * - `textClassName` — sizing/colour overrides for the wordmark
 * - `mark` / `wordmark` — toggle either half
 */
export function BrandLogo({
  href,
  size = 32,
  className,
  textClassName = "text-xl",
  mark = true,
  wordmark = true,
  priority = false,
}: {
  href?: string;
  size?: number;
  className?: string;
  textClassName?: string;
  mark?: boolean;
  wordmark?: boolean;
  priority?: boolean;
}) {
  const content = (
    <>
      {mark && (
        <LogoMark
          size={size}
          priority={priority}
          className="transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105"
        />
      )}
      {wordmark && <Wordmark className={textClassName} />}
    </>
  );

  const base = cn("group inline-flex items-center gap-2", className);

  return href ? (
    <Link href={href} className={base}>
      {content}
    </Link>
  ) : (
    <span className={base}>{content}</span>
  );
}
