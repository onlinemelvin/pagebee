import * as React from "react";

/** Shared shell for the legal pages (Privacy, Terms): centered prose column with a
 *  title + "last updated" line. Rendered inside the (public) layout, so it inherits
 *  the marketing header/footer. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
      <h1 className="font-display text-4xl tracking-tight text-stone-900">{title}</h1>
      <p className="mt-3 text-sm text-stone-500">Last updated: {updated}</p>
      <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-stone-600">{children}</div>
    </article>
  );
}

/** A titled section within a legal page. */
export function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl text-stone-900">{heading}</h2>
      {children}
    </section>
  );
}
