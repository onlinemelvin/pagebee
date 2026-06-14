import { cn } from "@/lib/utils";

/**
 * Subtle honeycomb texture for backdrops — premium, brand-cohesive, never loud.
 * Absolutely positioned + pointer-events-none, so it sits behind content. Keep the
 * opacity low (default 0.05) so it reads as texture, not decoration.
 */
export function Honeycomb({
  className,
  opacity = 0.05,
  scale = 1.4,
  tint = "#f5a623",
}: {
  className?: string;
  opacity?: number;
  scale?: number;
  tint?: string;
}) {
  return (
    <svg
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
      style={{ opacity }}
    >
      <defs>
        <pattern id="pb-honeycomb" width="17.32" height="30" patternUnits="userSpaceOnUse" patternTransform={`scale(${scale})`}>
          <g fill="none" stroke={tint} strokeWidth="1">
            <polygon points="0,-10 8.66,-5 8.66,5 0,10 -8.66,5 -8.66,-5" />
            <polygon points="8.66,5 17.32,10 17.32,20 8.66,25 0,20 0,10" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#pb-honeycomb)" />
    </svg>
  );
}
