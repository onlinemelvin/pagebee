import { Skeleton } from "@/components/ui/skeleton";
import { LoadingHint } from "@/components/client/ui/LoadingHint";

export default function Loading() {
  return (
    <div>
      <LoadingHint text="Gathering your services…" />
      <Skeleton className="mt-4 h-9 w-40" />
      <Skeleton className="mt-2 h-4 w-96" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-stone-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="flex-1"><Skeleton className="h-4 w-1/2" /><Skeleton className="mt-1.5 h-3 w-2/3" /></div>
            </div>
            <Skeleton className="mt-3 h-10 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
