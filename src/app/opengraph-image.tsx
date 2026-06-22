import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Dynamic social card (also used by Twitter, which falls back to og:image).
export const alt = "PageBee — Professional websites for local small businesses";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const AMBER = "#f5a623";
const INK = "#1c1917";
const CREAM = "#fdfbf5";

export default async function OpengraphImage() {
  // Inline the bee mark as a data URI so it renders without a network fetch.
  const logo = await readFile(
    join(process.cwd(), "public", "logo", "pagebee-logo.png"),
  );
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: `linear-gradient(135deg, ${CREAM} 0%, #fdf3dd 100%)`,
          padding: "72px 80px",
        }}
      >
        {/* Brand lockup */}
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} height={120} alt="" />
          <div
            style={{
              display: "flex",
              fontSize: 64,
              fontWeight: 800,
              letterSpacing: "-0.02em",
            }}
          >
            <span style={{ color: INK }}>Page</span>
            <span style={{ color: AMBER }}>Bee</span>
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              fontSize: 68,
              fontWeight: 700,
              lineHeight: 1.1,
              color: INK,
              letterSpacing: "-0.02em",
              maxWidth: 900,
            }}
          >
            Professional websites for local small businesses
          </div>
          <div style={{ fontSize: 30, color: "#78716c", maxWidth: 880 }}>
            Built, hosted, and automated for you — booking, chat, payments, and
            AI follow-up, without the agency bill.
          </div>
        </div>

        {/* Accent bar */}
        <div
          style={{
            display: "flex",
            height: 12,
            width: "100%",
            borderRadius: 999,
            background: AMBER,
          }}
        />
      </div>
    ),
    { ...size },
  );
}
