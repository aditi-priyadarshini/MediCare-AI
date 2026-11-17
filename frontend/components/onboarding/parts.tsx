"use client";

import { cn } from "@/lib/cn";

export type Direction = "forward" | "back";

/**
 * One step's content. Optional steps with their own forms stay mounted once visited (`keepMounted`),
 * so half-typed text is still there when the person goes back and forth. The wrapper animates in
 * from the side they are moving towards; reduced motion removes it (see globals.css).
 */
export function StepPanel({
  active,
  visited,
  keepMounted,
  direction,
  children,
}: {
  active: boolean;
  visited: boolean;
  keepMounted?: boolean;
  direction: Direction;
  children: React.ReactNode;
}) {
  if (!active && !(keepMounted && visited)) return null;
  return (
    <div hidden={!active} className={cn(direction === "back" ? "step-back" : "step-forward", "space-y-5")}>
      {children}
    </div>
  );
}

/** Sticky bottom bar. Keeps the main action in reach on phones and respects the home-indicator inset. */
export function ActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-line bg-surface/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:mx-0 sm:rounded-card sm:border sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-3">{children}</div>
    </div>
  );
}
