import Link from "next/link";
import type { PublishedSite } from "@/lib/modules/website";
import { SITE_TOKEN_PLACEHOLDER } from "@/lib/ai/website-generator";
import { SiteContactForm } from "./SiteContactForm";

interface SiteCopy {
  heroHeadline?: string;
  heroSubheadline?: string;
  aboutText?: string;
  services?: Array<{ name: string; description?: string }>;
  faqs?: Array<{ q: string; a: string }>;
  ctaText?: string;
}
interface SiteTheme {
  primaryColor?: string;
  secondaryColor?: string;
}

export function SiteRenderer({ site, path }: { site: PublishedSite; path: string }) {
  // Code-generated mode: serve the full generated document in a sandboxed iframe,
  // with the site token injected so its forms can call the shared API.
  const generated = site.publishedVersion?.generatedHtml;
  if (generated) {
    const doc = generated.replaceAll(SITE_TOKEN_PLACEHOLDER, site.siteToken);
    return (
      <iframe
        title={site.client.businessName}
        srcDoc={doc}
        sandbox="allow-scripts allow-forms allow-popups"
        className="fixed inset-0 h-full w-full border-0"
      />
    );
  }

  const version = site.publishedVersion!;
  const copy = (version.config?.copy ?? {}) as unknown as SiteCopy;
  const theme = (version.config?.theme ?? {}) as unknown as SiteTheme;
  const accent = theme.primaryColor || "#f59e0b";
  const ink = theme.secondaryColor || "#1c1917";

  const pages = version.pages;
  const current = pages.find((p) => p.slug === path) ?? pages.find((p) => p.slug === "/") ?? pages[0];
  const sections = (current?.sections ?? []) as unknown as string[];

  const business = site.client.businessName;

  return (
    <div style={{ color: ink }} className="min-h-screen bg-white">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-black/10 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="text-lg font-bold tracking-tight" style={{ color: ink }}>
            {business}
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            {pages.map((p) => (
              <Link key={p.id} href={p.slug} className="opacity-70 hover:opacity-100">
                {p.title}
              </Link>
            ))}
            {site.client.ownerPhone && (
              <a
                href={`tel:${site.client.ownerPhone}`}
                className="rounded-full px-4 py-2 text-sm font-semibold text-white"
                style={{ background: accent }}
              >
                Call now
              </a>
            )}
          </nav>
        </div>
      </header>

      <main>
        {sections.map((section, i) => (
          <Section
            key={`${section}-${i}`}
            name={section}
            copy={copy}
            accent={accent}
            business={business}
            email={site.client.ownerEmail}
            phone={site.client.ownerPhone}
            siteToken={site.siteToken}
          />
        ))}
      </main>

      <footer className="border-t border-black/10 py-10 text-center text-sm opacity-60">
        © {new Date().getFullYear()} {business}.{" "}
        <span className="opacity-70">Powered by PageBee.</span>
      </footer>
    </div>
  );
}

function Section({
  name,
  copy,
  accent,
  business,
  email,
  phone,
  siteToken,
}: {
  name: string;
  copy: SiteCopy;
  accent: string;
  business: string;
  email: string | null;
  phone: string | null;
  siteToken: string;
}) {
  switch (name) {
    case "Hero":
      return (
        <section className="relative overflow-hidden px-6 py-24 text-center sm:py-32">
          <div
            className="pointer-events-none absolute inset-0 -z-10 opacity-10"
            style={{ background: `radial-gradient(60% 60% at 50% 0%, ${accent}, transparent)` }}
          />
          <div className="mx-auto max-w-3xl">
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">
              {copy.heroHeadline ?? business}
            </h1>
            {copy.heroSubheadline && (
              <p className="mx-auto mt-6 max-w-xl text-lg opacity-70">{copy.heroSubheadline}</p>
            )}
            <a
              href="#contact"
              className="mt-8 inline-block rounded-full px-8 py-4 text-base font-semibold text-white"
              style={{ background: accent }}
            >
              {copy.ctaText ?? "Get in touch"}
            </a>
          </div>
        </section>
      );

    case "Services":
      return (
        <section className="px-6 py-20">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-center text-3xl font-bold tracking-tight">Our services</h2>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {(copy.services ?? []).map((s, i) => (
                <div key={i} className="rounded-2xl border border-black/10 p-6">
                  <div className="mb-3 h-1 w-10 rounded" style={{ background: accent }} />
                  <h3 className="text-lg font-semibold">{s.name}</h3>
                  {s.description && <p className="mt-2 text-sm opacity-70">{s.description}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      );

    case "About":
      return copy.aboutText ? (
        <section className="bg-black/[0.03] px-6 py-20">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold tracking-tight">About us</h2>
            <p className="mt-6 text-lg leading-relaxed opacity-80">{copy.aboutText}</p>
          </div>
        </section>
      ) : null;

    case "FAQ":
      return copy.faqs && copy.faqs.length > 0 ? (
        <section className="px-6 py-20">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-center text-3xl font-bold tracking-tight">FAQ</h2>
            <div className="mt-10 divide-y divide-black/10">
              {copy.faqs.map((f, i) => (
                <div key={i} className="py-5">
                  <p className="font-semibold">{f.q}</p>
                  <p className="mt-2 opacity-70">{f.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null;

    case "BookingWidget":
      return (
        <section className="px-6 py-16 text-center">
          <div className="mx-auto max-w-xl rounded-2xl border border-black/10 p-8">
            <h2 className="text-2xl font-bold">Book an appointment</h2>
            <p className="mt-2 opacity-70">Online booking is coming soon. Reach us below to schedule.</p>
          </div>
        </section>
      );

    case "Contact":
      return (
        <section id="contact" className="bg-black/[0.03] px-6 py-20">
          <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Get in touch</h2>
              <p className="mt-3 opacity-70">We&apos;d love to hear from you.</p>
              <div className="mt-6 space-y-2 text-sm">
                {phone && (
                  <p>
                    <span className="opacity-60">Phone:</span>{" "}
                    <a href={`tel:${phone}`} style={{ color: accent }}>{phone}</a>
                  </p>
                )}
                {email && (
                  <p>
                    <span className="opacity-60">Email:</span>{" "}
                    <a href={`mailto:${email}`} style={{ color: accent }}>{email}</a>
                  </p>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-black/10 bg-white p-6">
              <SiteContactForm siteToken={siteToken} accent={accent} />
            </div>
          </div>
        </section>
      );

    default:
      return null;
  }
}
