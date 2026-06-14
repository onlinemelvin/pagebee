import { Skeleton } from "@/components/ui/skeleton";
import { LoadingHint } from "@/components/client/ui/LoadingHint";

/** Route-level loading skeleton — mirrors the redesigned Overview layout. */
export default function Loading() {
  return (
    <div className="space-y-6">
      <LoadingHint text="Warming up the hive…" />
      <div>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-2 h-9 w-72" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-stone-200 bg-white p-5">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="mt-4 h-8 w-2/3" />
            <Skeleton className="mt-2 h-4 w-1/2" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-stone-200 bg-white p-6 lg:col-span-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-5 h-48 w-full" />
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-6">
          <Skeleton className="h-5 w-32" />
          <div className="mt-6 flex justify-center"><Skeleton className="h-32 w-32 rounded-full" /></div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-stone-200 bg-white p-6 lg:col-span-2">
          <Skeleton className="h-5 w-40" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="mt-4 flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1"><Skeleton className="h-4 w-1/3" /><Skeleton className="mt-1.5 h-3 w-2/3" /></div>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-6">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="mt-5 h-40 w-full" />
        </div>
      </div>
    </div>
  );
}
