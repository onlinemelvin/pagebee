"use client";

import { Toaster } from "sonner";

/** App-wide toast host — warm PageBee styling, top-right. Mounted once in the root layout. */
export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      gap={10}
      toastOptions={{
        classNames: {
          toast: "!rounded-xl !border !border-stone-200/80 !bg-white !text-stone-800 !shadow-[var(--shadow-card)] !font-sans",
          title: "!text-sm !font-medium",
          description: "!text-xs !text-stone-500",
          success: "!text-emerald-700",
          error: "!text-rose-700",
          actionButton: "!bg-stone-900 !text-white",
        },
      }}
    />
  );
}

// Single import site for toasts across the app.
export { toast } from "sonner";
