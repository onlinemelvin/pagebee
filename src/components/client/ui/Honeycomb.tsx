import { cn } from "@/lib/utils";

/**
 * Subtle honeycomb texture for backdrops — premium, brand-cohesive, never loud.
 * Absolutely positioned + pointer-events-none, so it sits behind content. Keep the
 * opacity low (default 0.05) so it reads as texture, not decoration.
 *
 * Two looks:
 *  - default: a single repeating stroked-outline pattern (cheap, uniform).
 *  - `filled`: a regular comb where each hexagon is tinted a slightly different yellow/amber.
 *    The tint is a deterministic function of the cell index, so it's stable and tiles seamlessly.
 */
export function Honeycomb({
  className,
  opacity = 0.05,
  scale = 1.4,
  tint = "#f5a623",
  filled = false,
}: {
  className?: string;
  opacity?: number;
  scale?: number;
  tint?: string;
  filled?: boolean;
}) {
  if (filled) return <FilledHoneycomb className={className} opacity={opacity} />;

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

// Warm palette — closely related yellows/ambers so the variation reads as subtle tonal shifts.
const HEX_FILLS = ["#fde68a", "#fcd34d", "#fde047", "#facc15", "#fbbf24", "#fde68a"];

// Deterministic [0,1) pseudo-random from an integer — stable across SSR/CSR.
function rand(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// Flat-top hexagon points centred at (cx, cy) with circumradius r.
function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i; // 0°,60°,…
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

function FilledHoneycomb({ className, opacity }: { className?: string; opacity: number }) {
  const r = 13; // hex circumradius in px — smaller = finer comb
  const dx = 1.5 * r; // horizontal centre-to-centre
  const dy = Math.sqrt(3) * r; // vertical centre-to-centre
  // The colour cluster repeats every PC columns × PR rows. PC must be EVEN so the odd-column
  // vertical offset lines up at the tile seam. One tile is reused by a single <rect>, so the
  // whole backdrop is ~PC×PR polygons (~80) rather than thousands — cheap to render.
  const PC = 8;
  const PR = 6;
  const tileW = PC * dx;
  const tileH = PR * dy;

  // Build ONE seamless tile as an SVG string. Overdraw one cell beyond each edge so hexes straddling
  // the seam clip cleanly; the tint is keyed by the wrapped (mod) cell index, so a hex and its
  // periodic image share a colour and the tile repeats without a visible join.
  let polys = "";
  for (let c = -1; c <= PC; c++) {
    for (let rIdx = -1; rIdx <= PR; rIdx++) {
      const parity = ((c % 2) + 2) % 2;
      const cx = c * dx;
      const cy = rIdx * dy + (parity ? dy / 2 : 0);
      const cMod = ((c % PC) + PC) % PC;
      const rMod = ((rIdx % PR) + PR) % PR;
      const fill = HEX_FILLS[Math.floor(rand(cMod * 73 + rMod * 911) * HEX_FILLS.length)];
      polys += `<polygon points='${hexPoints(cx, cy, r * 0.92)}' fill='${fill}' stroke='#b45309' stroke-width='0.6'/>`;
    }
  }
  const tile = `<svg xmlns='http://www.w3.org/2000/svg' width='${tileW}' height='${tileH}' viewBox='0 0 ${tileW} ${tileH}'>${polys}</svg>`;

  // Render as a single tiled background-image: the browser decodes the small tile once and blits it
  // (no per-hex DOM nodes, cheapest composite) while staying vector-crisp at any DPI.
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
      style={{
        opacity,
        backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(tile)}")`,
        backgroundRepeat: "repeat",
        backgroundSize: `${tileW}px ${tileH}px`,
      }}
    />
  );
}
