import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Fraunces } from "next/font/google";
import { Baloo_2 } from "next/font/google";
import "./globals.css";
import { AppToaster } from "@/components/ui/toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Brand wordmark font — rounded, warm and friendly to match the bee mark.
const baloo = Baloo_2({
  variable: "--font-brand",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const TITLE = "Professional websites for local small businesses";
const DESCRIPTION =
  "PageBee builds, hosts, and automates your business website — with booking, chat, payments, and AI follow-up built in. No agency bill, no maintenance, no code.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `PageBee — ${TITLE}`,
    template: "%s · PageBee",
  },
  description: DESCRIPTION,
  applicationName: "PageBee",
  keywords: [
    "small business website",
    "local business website",
    "website for small business",
    "online booking",
    "appointment scheduling",
    "business website builder",
    "managed website hosting",
    "AI customer follow-up",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "PageBee",
    url: SITE_URL,
    title: `PageBee — ${TITLE}`,
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `PageBee — ${TITLE}`,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${fraunces.variable} ${baloo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
