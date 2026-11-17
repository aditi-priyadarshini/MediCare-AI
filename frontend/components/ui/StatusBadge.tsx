import { AlertTriangle, CheckCircle2, Info, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { VerificationBadge } from "./primitives";

export type StatusTone = "neutral" | "info" | "success" | "caution" | "danger" | "ai";

const TONES: Record<StatusTone, { cls: string; icon: LucideIcon }> = {
  neutral: { cls: "bg-mint-100 text-teal-700", icon: Info },
  info: { cls: "bg-info-100 text-info-700", icon: Info },
  success: { cls: "bg-success-100 text-success-700", icon: CheckCircle2 },
  caution: { cls: "bg-amber-100 text-amber-600", icon: AlertTriangle },
  danger: { cls: "bg-danger-100 text-danger-700", icon: AlertTriangle },
  ai: { cls: "bg-lavender-100 text-lavender-700", icon: Sparkles },
};

/** Tone + icon + text. Meaning is never carried by colour alone. Red is for serious safety/emergency only. */
export function StatusBadge({ tone = "neutral", icon, children }: { tone?: StatusTone; icon?: LucideIcon; children: React.ReactNode }) {
  const t = TONES[tone];
  const Icon = icon ?? t.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", t.cls)}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {children}
    </span>
  );
}

/** Where a value came from: patient reported / imported / clinician confirmed / needs review. */
export function SourceBadge({ source }: { source: string }) {
  return <VerificationBadge status={source} />;
}
