import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <Skeleton className="h-8 w-44" />
      <Skeleton className="mt-2 h-4 w-72" />
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
