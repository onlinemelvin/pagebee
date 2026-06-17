// Pull the site's REAL brand/accent color out of its generated HTML. The structured config's
// theme.primaryColor is produced by a separate LLM pass than the HTML and is unreliable (it often
// invents unrelated colors), so the preview cover reads the actual color the site uses instead.
//
// Strategy: prefer an explicit --brand / --primary / --accent CSS variable (the HTML rules tell
// the generator to define brand colors that way), then fall back to the most frequent non-neutral
// hex in the document. Returns null when nothing suitable is found (caller uses a neutral default).

/** Extract the dominant brand/accent hex color from generated site HTML, or null. */
export function extractAccentColor(html: string | null | undefined): string | null {
  if (!html) return null;

  const varMatch = html.match(/--(?:brand|primary|accent)[\w-]*\s*:\s*(#[0-9a-fA-F]{3,8})/i);
  if (varMatch) {
    const c = normHex(varMatch[1]);
    if (c && !isNeutral(c)) return c;
  }

  const counts = new Map<string, number>();
  for (const m of html.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
    const c = `#${m[1].toLowerCase()}`;
    if (isNeutral(c)) continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [c, n] of counts) {
    if (n > bestN) {
      best = c;
      bestN = n;
    }
  }
  return best;
}

function normHex(h: string): string | null {
  const x = h.toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(x)) return `#${x[1]}${x[1]}${x[2]}${x[2]}${x[3]}${x[3]}`;
  if (/^#[0-9a-f]{6}$/.test(x)) return x;
  if (/^#[0-9a-f]{8}$/.test(x)) return x.slice(0, 7);
  return null;
}

/** White-ish, black-ish, or low-saturation gray → not a brand color. */
function isNeutral(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  if (max > 238 && min > 238) return true; // near-white
  if (max < 28) return true; // near-black
  return sat < 0.18; // grayish
}
