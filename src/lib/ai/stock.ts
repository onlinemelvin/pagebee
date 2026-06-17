// Royalty-free stock photos via Pexels (https://www.pexels.com/api/) — free key.
// Gated on PEXELS_API_KEY; returns [] when unset so generation falls back to
// tasteful CSS backgrounds (the generator is told never to emit broken image links).

export interface StockImage {
  query: string;
  url: string;
  alt: string;
}

interface PexelsResponse {
  photos?: Array<{ alt?: string; src?: { large?: string; landscape?: string } }>;
}

export async function fetchStockImages(queries: string[]): Promise<StockImage[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key || queries.length === 0) return [];

  const images: StockImage[] = [];
  const seen = new Set<string>();
  for (const query of queries.slice(0, 8)) {
    try {
      const res = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
        { headers: { Authorization: key }, signal: AbortSignal.timeout(15000) },
      );
      if (!res.ok) continue;
      const data = (await res.json()) as PexelsResponse;
      const photo = data.photos?.[0];
      const url = photo?.src?.large ?? photo?.src?.landscape;
      if (url && !seen.has(url)) {
        seen.add(url);
        images.push({ query, url, alt: photo?.alt || query });
      }
    } catch (err) {
      console.error(`[stock] pexels failed for "${query}":`, (err as Error)?.message);
    }
  }
  return images;
}
