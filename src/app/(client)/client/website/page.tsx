import { getCurrentClient } from "@/lib/auth/session";
import { getClientWebsite } from "@/lib/modules/website";
import { WebsiteIntakeForm } from "@/components/client/WebsiteIntakeForm";

export const dynamic = "force-dynamic";

const VERSION_STATUS: Record<string, { label: string; tone: string; note: string }> = {
  PREVIEW: { label: "In review", tone: "bg-amber-100 text-amber-800", note: "Your draft is generated and waiting for our team to review before it goes live." },
  PUBLISHED: { label: "Published", tone: "bg-green-100 text-green-800", note: "Your website is live." },
  DRAFT: { label: "Draft", tone: "bg-stone-100 text-stone-600", note: "Draft saved." },
  ARCHIVED: { label: "Archived", tone: "bg-stone-100 text-stone-600", note: "" },
};

export default async function ClientWebsitePage() {
  const result = await getCurrentClient();
  if (!result) return null;
  const website = await getClientWebsite(result.client.id);
  const latest = website?.versions[0];
  const copy = (latest?.config?.copy ?? null) as unknown as { heroHeadline?: string; heroSubheadline?: string } | null;
  const status = latest ? VERSION_STATUS[latest.status] ?? null : null;

  return (
    <div>
      <h1 className="font-display text-3xl text-stone-900">Your website</h1>
      <p className="mt-1 text-stone-500">
        Tell us about your business and we&apos;ll generate a draft for review.
      </p>

      {latest && status && (
        <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
              Current draft · v{latest.version}
            </p>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.tone}`}>{status.label}</span>
          </div>
          {copy?.heroHeadline && (
            <p className="mt-3 font-display text-2xl text-stone-900">{copy.heroHeadline}</p>
          )}
          {copy?.heroSubheadline && <p className="mt-1 text-stone-600">{copy.heroSubheadline}</p>}
          {website?.subdomain && (
            <p className="mt-3 text-sm text-stone-500">
              Address: <span className="font-medium text-stone-700">{website.subdomain}.pagebee.com</span>
            </p>
          )}
          {status.note && <p className="mt-3 text-sm text-stone-600">{status.note}</p>}
        </div>
      )}

      <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="font-display text-xl text-stone-900">
          {latest ? "Regenerate your website" : "Generate your website"}
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          {latest ? "Submit updated details to create a new draft for review." : "A few details is all we need to start."}
        </p>
        <div className="mt-6">
          <WebsiteIntakeForm submitLabel={latest ? "Regenerate draft" : "Generate my website"} />
        </div>
      </div>
    </div>
  );
}
