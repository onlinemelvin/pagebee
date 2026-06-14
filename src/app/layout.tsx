import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Fraunces } from "next/font/google";
import { Baloo_2 } from "next/font/google";
import "./globals.css";

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

export const metadata: Metadata = {
  title: "PageBee — Professional websites for local businesses",
  description:
    "Built, hosted, maintained, and automated for you. Websites with booking, chat, payments, and AI follow-up — without the expensive agency bill.",
  icons: {
    icon: "/logo/pagebee-logo.png",
    shortcut: "/logo/pagebee-logo.png",
    apple: "/logo/pagebee-logo.png",
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
