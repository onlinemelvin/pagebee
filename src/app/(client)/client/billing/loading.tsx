import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-2 h-4 w-56" />
      <div className="mt-6 space-y-4">
        <SkeletonCard lines={1} />
        <SkeletonCard lines={2} />
      </div>
    </div>
  );
}
