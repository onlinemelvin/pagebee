import { cn } from "@/lib/utils";

/** A shimmering placeholder block. Compose these to mirror a page's layout while it loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-stone-200/80", className)} />;
}

/** A bordered card skeleton with a few text lines — the common dashboard building block. */
export function SkeletonCard({ className, lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div className={cn("rounded-2xl border border-stone-200 bg-white p-5", className)}>
      <Skeleton className="h-4 w-1/3" />
      <div className="mt-3 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")} />
        ))}
      </div>
    </div>
  );
}
