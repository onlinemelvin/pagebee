/** A small, warm loading line for route skeletons — a touch of brand personality. */
export function LoadingHint({ text = "Calling the worker bees…" }: { text?: string }) {
  return (
    <p className="flex items-center gap-1.5 text-sm text-amber-700/70">
      <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-amber-400" /> {text}
    </p>
  );
}
