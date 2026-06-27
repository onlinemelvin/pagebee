import React from "react";
import { Page, Text, View, Image, Svg, Polygon, Rect, Defs, LinearGradient, Stop, G, StyleSheet } from "@react-pdf/renderer";
import { appBase } from "@/lib/modules/email/layout";
import { PAGEBEE_LOGO_DATA_URL } from "./logo-data";

// Shared PageBee PDF theme — the consistent chrome wrapped around every generated PDF: branded
// header (logo + wordmark + document title), a footer with the company address and page numbers,
// and a faint honeycomb watermark. Documents supply their own body; ThemedPage owns the frame.

// — Brand tokens (mirror src/lib/modules/email/layout.ts BRAND) -----------------
export const PDF = {
  amber: "#f59e0b",
  amberDark: "#d97706",
  honey: "#fbbf24",
  ink: "#1c1917",
  body: "#44403c",
  soft: "#78716c",
  faint: "#a8a29e",
  line: "#e7e5e4",
  panel: "#faf9f7",
  white: "#ffffff",
};

// — Company identity shown in the footer (override per-deployment via env) -------
export const PDF_COMPANY = {
  name: process.env.PDF_COMPANY_NAME || "PageBee",
  legalName: process.env.PDF_COMPANY_LEGAL_NAME || "PageBee LLC",
  address: process.env.PDF_COMPANY_ADDRESS || "7901 4th St N STE 300, St Petersburg, FL 33702",
  email: process.env.PDF_COMPANY_EMAIL || "hello@pagebee.com",
  site: (process.env.NEXT_PUBLIC_ROOT_DOMAIN || appBase().replace(/^https?:\/\//, "")).replace(/\/$/, ""),
};

/** Single-line company identity for the footer. */
export function companyFooterLine(): string {
  return [PDF_COMPANY.name, PDF_COMPANY.address, PDF_COMPANY.email, PDF_COMPANY.site].filter(Boolean).join("  ·  ");
}

// — Logo --------------------------------------------------------------------------
// @react-pdf needs the bytes, not a Next-served path. The logo is committed as a base64 data URL
// (logo-data.ts) so it's always bundled — no filesystem/network at render time (both unreliable on
// serverless). Async signature kept for callers/future flexibility.
export async function getLogoDataUrl(): Promise<string | null> {
  return PAGEBEE_LOGO_DATA_URL || null;
}

// — Honeycomb watermark ---------------------------------------------------------
function hexPoints(cx: number, cy: number, r: number): string {
  // Flat-top hexagon.
  return [0, 60, 120, 180, 240, 300]
    .map((deg) => {
      const rad = (Math.PI / 180) * deg;
      return `${(cx + r * Math.cos(rad)).toFixed(2)},${(cy + r * Math.sin(rad)).toFixed(2)}`;
    })
    .join(" ");
}

/**
 * A faint hexagon lattice used as a decorative watermark. The lattice is drawn at a low base opacity
 * and then a white gradient is painted on top so it dissolves ("fades into white") from the page
 * corner toward the content. `id` must be unique per instance (gradients share an SVG id namespace).
 */
function Honeycomb({
  id,
  cols,
  rows,
  r,
  peak = 0.06,
  corner = "topRight",
  color = PDF.honey,
}: {
  id: string;
  cols: number;
  rows: number;
  r: number;
  peak?: number;
  corner?: "topRight" | "bottomLeft";
  color?: string;
}) {
  const hStep = 1.5 * r; // horizontal spacing between flat-top hex centers
  const vStep = Math.sqrt(3) * r; // vertical spacing
  const cells: string[] = [];
  for (let c = 0; c < cols; c++) {
    for (let rw = 0; rw < rows; rw++) {
      const cx = c * hStep + r;
      const cy = rw * vStep + (c % 2 ? vStep / 2 : 0) + r;
      cells.push(hexPoints(cx, cy, r));
    }
  }
  const width = (cols - 1) * hStep + 2 * r;
  const height = rows * vStep + r;
  // Gradient runs corner→interior: transparent at the corner (lattice shows), opaque white toward
  // the page (lattice dissolves). objectBoundingBox coords (0..1).
  const g = corner === "topRight" ? { x1: 1, y1: 0, x2: 0, y2: 1 } : { x1: 0, y1: 1, x2: 1, y2: 0 };
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={id} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}>
          <Stop offset="0" stopColor="#ffffff" stopOpacity={0} />
          <Stop offset="0.8" stopColor="#ffffff" stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <G opacity={peak}>
        {cells.map((pts, i) => (
          <Polygon key={i} points={pts} fill="none" stroke={color} strokeWidth={0.6} />
        ))}
      </G>
      <Rect x={0} y={0} width={width} height={height} fill={`url(#${id})`} />
    </Svg>
  );
}

// — Page chrome -----------------------------------------------------------------
const th = StyleSheet.create({
  page: {
    paddingTop: 100,
    paddingBottom: 60,
    paddingHorizontal: 46,
    fontSize: 9.5,
    color: PDF.ink,
    fontFamily: "Helvetica",
    lineHeight: 1.5,
  },
  honeyTop: { position: "absolute", top: -10, right: -26 },
  honeyBottom: { position: "absolute", bottom: 24, left: -30 },
  header: { position: "absolute", top: 34, left: 46, right: 46, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerLeft: { flexDirection: "row", alignItems: "center" },
  // marginBottom offsets the small address line below the wordmark so the logo centers on the
  // wordmark itself (the visual anchor), not the full two-line text column.
  logo: { width: 21, height: 29, marginRight: 8, marginBottom: 10 },
  word: { fontSize: 15, fontFamily: "Helvetica-Bold", letterSpacing: -0.3, lineHeight: 1 },
  wordPage: { color: PDF.ink },
  wordBee: { color: PDF.amber },
  headerAddr: { fontSize: 6.5, color: PDF.faint, marginTop: 4 },
  headerRight: { alignItems: "flex-end" },
  docTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", color: PDF.ink },
  docSub: { fontSize: 8.5, color: PDF.soft, marginTop: 1 },
  rule: { position: "absolute", top: 74, left: 46, right: 46, borderTopWidth: 1.5, borderTopColor: PDF.amber },
  footer: { position: "absolute", bottom: 30, left: 46, right: 46, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 0.75, borderTopColor: PDF.line, paddingTop: 6 },
  footerText: { fontSize: 7.5, color: PDF.faint },
  footerPage: { fontSize: 7.5, color: PDF.faint },
});

/**
 * A themed A4 page: branded header, footer, and honeycomb watermark, with the document's body as
 * children. Header/footer/watermark are `fixed`, so they repeat on every page; page padding already
 * reserves space for them.
 */
export function ThemedPage({
  docTitle,
  docSubtitle,
  logo,
  children,
}: {
  docTitle: string;
  docSubtitle?: string;
  logo?: string | null;
  children: React.ReactNode;
}) {
  return (
    <Page size="A4" style={th.page}>
      <View fixed style={th.honeyTop}>
        <Honeycomb id="honeyTop" corner="topRight" cols={6} rows={5} r={15} peak={0.16} />
      </View>
      <View fixed style={th.honeyBottom}>
        <Honeycomb id="honeyBottom" corner="bottomLeft" cols={4} rows={3} r={13} peak={0.13} />
      </View>

      <View fixed style={th.header}>
        <View style={th.headerLeft}>
          {logo ? <Image src={logo} style={th.logo} /> : null}
          <View>
            <Text style={th.word}>
              <Text style={th.wordPage}>Page</Text>
              <Text style={th.wordBee}>Bee</Text>
            </Text>
            {PDF_COMPANY.address ? <Text style={th.headerAddr}>{PDF_COMPANY.address}</Text> : null}
          </View>
        </View>
        <View style={th.headerRight}>
          <Text style={th.docTitle}>{docTitle}</Text>
          {docSubtitle ? <Text style={th.docSub}>{docSubtitle}</Text> : null}
        </View>
      </View>
      <View fixed style={th.rule} />

      {children}

      <View fixed style={th.footer}>
        <Text style={th.footerText}>{companyFooterLine()}</Text>
        <Text style={th.footerPage} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      </View>
    </Page>
  );
}
