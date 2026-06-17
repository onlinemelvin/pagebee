import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <Skeleton className="h-7 w-40" />
      <Skeleton className="mt-2 h-4 w-72" />

      <div className="mt-6 flex flex-wrap gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-full" />
        ))}
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <div className="border-b border-stone-200 bg-stone-50 px-4 py-3">
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="divide-y divide-stone-100">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-7 w-24 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
