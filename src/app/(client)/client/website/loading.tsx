import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-2 h-4 w-96" />

      <div className="mt-6">
        <SkeletonCard lines={3} />
      </div>

      <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-2 h-3 w-72" />
        <div className="mt-6 flex justify-end">
          <Skeleton className="h-10 w-40" />
        </div>
      </div>
    </div>
  );
}
