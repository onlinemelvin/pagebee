import { BookOpen, ExternalLink } from "lucide-react";
import { getRepWorkspace, listRepResources } from "@/lib/modules/sales";

export const dynamic = "force-dynamic";

export default async function RepResourcesPage() {
  const ws = await getRepWorkspace();
  if (!ws) return null;
  const groups = await listRepResources();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-stone-900">Resources</h1>
        <p className="mt-1 text-sm text-stone-500">Pitch decks, demos, scripts, and feature how-tos to get you selling.</p>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-200 bg-white p-12 text-center">
          <BookOpen size={28} className="mx-auto text-stone-300" />
          <p className="mt-3 text-sm text-stone-500">No resources yet — your manager will add enablement material here.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.group} className="rounded-2xl border border-stone-200 bg-white p-6">
              <h2 className="text-sm font-semibold text-stone-700">{g.group}</h2>
              <ul className="mt-3 divide-y divide-stone-100">
                {g.items.map((item) => (
                  <li key={item.id}>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between py-3 text-sm text-stone-700 transition-colors hover:text-amber-700"
                    >
                      <span>{item.title}</span>
                      <ExternalLink size={14} className="text-stone-400" />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
