"use client";

import type { LucideIcon } from "lucide-react";
import { ErrorState } from "@/components/ui/ErrorState";
import { Card, Skeleton } from "@/components/ui/primitives";
import { errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";

/**
 * One dashboard tile. It owns the loading skeleton and the error state so a failing call only
 * affects its own tile (the rest of the page keeps working). Never shows stale or made-up data.
 */
export function DashboardWidget({
  id,
  title,
  icon: Icon,
  action,
  loading,
  error,
  onRetry,
  rows = 3,
  tone = "plain",
  className,
  children,
}: {
  id: string;
  title: string;
  icon?: LucideIcon;
  /** Optional link or button in the header. */
  action?: React.ReactNode;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  rows?: number;
  /** "ai" is the lavender surface reserved for assistant content. */
  tone?: "plain" | "ai";
  className?: string;
  children?: React.ReactNode;
}) {
  const { t } = useT();
  const headingId = `${id}-heading`;
  return (
    <Card
      aria-labelledby={headingId}
      data-widget={id}
      className={cn("min-w-0", tone === "ai" && "border-lavender-700/20 bg-lavender-100", className)}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="flex min-w-0 items-center gap-2 text-h3 font-semibold text-navy-900">
          {Icon && <Icon className={cn("h-5 w-5 shrink-0", tone === "ai" ? "text-lavender-700" : "text-ink-soft")} aria-hidden />}
          <span className="min-w-0 break-words">{title}</span>
        </h2>
        {action}
      </div>
      {error ? (
        <ErrorState title={t("dash.error.title")} onRetry={onRetry} retryLabel={t("dash.error.retry")}>
          {errorMessage(error)}
        </ErrorState>
      ) : loading ? (
        <div role="status" aria-live="polite" className="space-y-2">
          <span className="sr-only">{t("dash.loading", { name: title })}</span>
          {Array.from({ length: rows }, (_, i) => (
            <Skeleton key={i} variant="row" />
          ))}
        </div>
      ) : (
        children
      )}
    </Card>
  );
}

/** A single labelled value, for lab highlights and similar. Value, unit and date use tabular numerals. */
export function MetricCard({
  label,
  value,
  unit,
  caption,
  badge,
  className,
}: {
  label: string;
  value: string;
  unit?: string | null;
  caption?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-lg border border-line bg-surface p-3", className)}>
      <p className="break-words text-sm font-medium text-ink-soft">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-navy-900 tnum">
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-ink-soft">{unit}</span>}
      </p>
      {badge && <div className="mt-2 flex flex-wrap items-center gap-1.5">{badge}</div>}
      {caption && <div className="mt-2 text-xs text-ink-soft tnum">{caption}</div>}
    </div>
  );
}
