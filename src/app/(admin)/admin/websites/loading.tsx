import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      {/* mirrors the optional "Generation activity" cards + the review queue table */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
      </div>
      <Skeleton className="h-7 w-72" />
      <Skeleton className="mt-2 h-4 w-96" />

      <div className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <div className="border-b border-stone-200 bg-stone-50 px-4 py-3">
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="divide-y divide-stone-100">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
