import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <Skeleton className="h-8 w-52" />
      <Skeleton className="mt-2 h-4 w-72" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} lines={2} />
        ))}
      </div>
    </div>
  );
}
