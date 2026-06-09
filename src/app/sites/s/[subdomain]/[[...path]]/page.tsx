import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedSiteBySubdomain } from "@/lib/modules/website";
import { SiteRenderer } from "@/components/site/SiteRenderer";

export const dynamic = "force-dynamic";

type Params = Promise<{ subdomain: string; path?: string[] }>;

function toPath(path?: string[]) {
  return "/" + (path?.join("/") ?? "");
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { subdomain } = await params;
  const site = await getPublishedSiteBySubdomain(subdomain);
  if (!site) return { title: "Not found" };
  const seo = (site.publishedVersion?.config?.seoDefaults ?? {}) as unknown as {
    seoTitle?: string;
    metaDescription?: string;
  };
  return {
    title: seo.seoTitle || site.client.businessName,
    description: seo.metaDescription || undefined,
  };
}

export default async function TenantSitePage({ params }: { params: Params }) {
  const { subdomain, path } = await params;
  const site = await getPublishedSiteBySubdomain(subdomain);
  if (!site) notFound();
  return <SiteRenderer site={site} path={toPath(path)} />;
}
