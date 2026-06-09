import Link from "next/link";
import { notFound } from "next/navigation";
import { getVersionDetail } from "@/lib/modules/website";
import { PublishButton } from "@/components/admin/PublishButton";

export const dynamic = "force-dynamic";

type Copy = {
  heroHeadline?: string;
  heroSubheadline?: string;
  aboutText?: string;
  services?: Array<{ name: string; description?: string }>;
  faqs?: Array<{ q: string; a: string }>;
  ctaText?: string;
};

export default async function AdminWebsiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const version = await getVersionDetail(id);
  if (!version) notFound();

  const copy = (version.config?.copy ?? {}) as unknown as Copy;
  const features = (version.config?.enabledFeatures ?? {}) as unknown as Record<string, boolean>;
  const published = version.status === "PUBLISHED";

  return (
    <div className="max-w-3xl">
      <Link href="/admin/websites" className="text-sm text-stone-500 hover:underline">
        ← Review queue
      </Link>

      <div className="mt-3 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-stone-900">{version.website.client.businessName}</h1>
          <p className="text-sm text-stone-500">
            Draft v{version.version} · {version.website.subdomain}.pagebee.com
          </p>
        </div>
        <PublishButton versionId={version.id} published={published} />
      </div>

      {/* Hero */}
      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Hero</p>
        <p className="mt-2 font-display text-2xl text-stone-900">{copy.heroHeadline ?? "—"}</p>
        <p className="mt-1 text-stone-600">{copy.heroSubheadline}</p>
        {copy.ctaText && <p className="mt-3 inline-block rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-800">{copy.ctaText}</p>}
      </section>

      {/* About */}
      {copy.aboutText && (
        <section className="mt-4 rounded-2xl border border-stone-200 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">About</p>
          <p className="mt-2 text-stone-700">{copy.aboutText}</p>
        </section>
      )}

      {/* Services */}
      {copy.services && copy.services.length > 0 && (
        <section className="mt-4 rounded-2xl border border-stone-200 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Services</p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {copy.services.map((s, i) => (
              <li key={i} className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-700">
                <span className="font-medium">{s.name}</span>
                {s.description ? <span className="text-stone-500"> — {s.description}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Pages + features */}
      <section className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-stone-200 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Pages</p>
          <ul className="mt-2 space-y-1 text-sm text-stone-700">
            {version.pages.map((p) => (
              <li key={p.id}>
                <span className="font-medium">{p.title}</span> <span className="text-stone-400">{p.slug}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Enabled features</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {Object.entries(features)
              .filter(([, on]) => on)
              .map(([key]) => (
                <li key={key} className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">
                  {key}
                </li>
              ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
