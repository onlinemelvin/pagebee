import type { Metadata } from "next";
import { BrandLogo } from "@/components/brand/Logo";
import { WaitlistForm } from "@/components/marketing/WaitlistForm";

export const metadata: Metadata = {
  title: "Coming soon",
  description: "PageBee is almost here — websites built, hosted, and automated for local businesses.",
  robots: { index: false, follow: false },
};

export default function ComingSoonPage() {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-20">
      {/* warm ambient glow, matching the marketing palette */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-gradient-to-b from-amber-200/50 to-rose-100/0 blur-3xl"
      />

      <div className="relative z-10 mx-auto w-full max-w-xl text-center">
        <div className="flex justify-center">
          <BrandLogo href={undefined} size={44} textClassName="text-2xl" priority />
        </div>

        <span className="mt-8 inline-flex items-center gap-2 rounded-full border border-amber-300/70 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
          Launching soon
        </span>

        <h1 className="font-display mt-6 text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">
          Something sweet is on the way.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-lg text-stone-600">
          PageBee builds, hosts, and automates websites for local businesses — booking, chat,
          payments, and AI follow-up, all built in. We&apos;re putting on the finishing touches.
        </p>

        <div className="mt-10">
          <WaitlistForm />
        </div>

        <p className="mt-10 text-sm text-stone-400">
          © {new Date().getFullYear()} PageBee. All rights reserved.
        </p>
      </div>
    </div>
  );
}
