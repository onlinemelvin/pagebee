import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-8">
      <div>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-2 h-4 w-80" />
      </div>

      <SkeletonCard className="border-amber-200 bg-amber-50/60" lines={2} />

      <section>
        <Skeleton className="h-3 w-40" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </div>
      </section>

      <section>
        <Skeleton className="h-3 w-32" />
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-stone-200 bg-white p-5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-8 w-16" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
