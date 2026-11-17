import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

/** Ordered steps. Text labels always shown; the current step is announced via aria-current. */
export function StepProgress({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Progress">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} aria-current={active ? "step" : undefined} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold tnum",
                done && "border-teal-700 bg-teal-700 text-white",
                active && "border-teal-700 bg-mint-100 text-teal-700",
                !done && !active && "border-line text-ink-soft",
              )}
            >
              {done ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <span className={cn(active ? "font-semibold text-ink" : "text-ink-soft")}>
              {label}
              <span className="sr-only">{done ? " (completed)" : active ? " (current step)" : ""}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
