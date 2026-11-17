import { HeartPulse } from "lucide-react";

export function Logo({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-700 text-white"
      >
        <HeartPulse className="h-5 w-5" />
      </span>
      <span className={(light ? "text-lg font-semibold text-white" : "text-lg font-semibold text-navy-900") + (compact ? " sr-only" : "")}>
        MediCare AI
      </span>
    </span>
  );
}
