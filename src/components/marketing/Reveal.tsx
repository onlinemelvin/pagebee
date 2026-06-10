"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type RevealProps<T extends React.ElementType> = {
  as?: T;
  /** Stagger delay in ms — apply increasing values to sibling items. */
  delay?: number;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

/**
 * Fade-and-rise on scroll into view. Pairs with the `.reveal` CSS in
 * globals.css; motion is disabled automatically under prefers-reduced-motion.
 * Uses IntersectionObserver (transform/opacity only — no layout thrash).
 */
export function Reveal<T extends React.ElementType = "div">({
  as,
  delay = 0,
  className,
  children,
  ...rest
}: RevealProps<T>) {
  const Tag = (as ?? "div") as React.ElementType;
  const ref = React.useRef<HTMLElement | null>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      queueMicrotask(() => setVisible(true));
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            obs.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={cn("reveal", visible && "is-visible", className)}
      style={{ "--reveal-delay": `${delay}ms` } as React.CSSProperties}
      {...rest}
    >
      {children}
    </Tag>
  );
}
