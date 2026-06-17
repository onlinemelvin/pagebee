import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="max-w-6xl">
      <Skeleton className="h-4 w-28" />
      <div className="mt-3 flex items-center justify-between gap-3">
        <div>
          <Skeleton className="h-7 w-56" />
          <Skeleton className="mt-2 h-3 w-64" />
        </div>
        <Skeleton className="h-9 w-40 rounded-lg" />
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-7 w-56 rounded-lg" />
        </div>
        <Skeleton className="mt-2 h-[70vh] w-full rounded-2xl" />
      </div>
    </div>
  );
}
