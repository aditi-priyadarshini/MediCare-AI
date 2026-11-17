"use client";

import { ArrowDown, ArrowUp, FlaskConical, Minus } from "lucide-react";
import Link from "next/link";
import { DashboardWidget, MetricCard } from "@/components/dashboard/DashboardWidget";
import { TrendChart } from "@/components/records/TrendChart";
import { EmptyState, VerificationBadge } from "@/components/ui/primitives";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api-client";
import { latestLabsByTest, trendCandidate } from "@/lib/dashboard";
import { useAsync, type AsyncState } from "@/lib/hooks";
import { useT, type MessageKey } from "@/lib/i18n";
import { formatDate, formatRange } from "@/lib/records";
import type { LabFlag, LabResult, LabTrend, Page } from "@/lib/types";

const FLAG: Record<LabFlag, { tone: StatusTone; icon: typeof Minus }> = {
  low: { tone: "caution", icon: ArrowDown },
  high: { tone: "caution", icon: ArrowUp },
  normal: { tone: "neutral", icon: Minus },
  unknown: { tone: "neutral", icon: Minus },
};

/**
 * The newest result of each test, compared with the range printed on its own report ("below / above
 * report range", never "abnormal"). A trend is offered only when two or more comparable results exist,
 * and always comes with its data table.
 */
export function LabHighlights({ labs }: { labs: AsyncState<Page<LabResult>> }) {
  const { t } = useT();
  const items = labs.data ? latestLabsByTest(labs.data.items, 4) : [];
  const candidate = labs.data ? trendCandidate(labs.data.items) : null;
  const trend = useAsync(
    () => (candidate ? api<LabTrend>(`/labs/trend?test_name=${encodeURIComponent(candidate)}`).catch(() => null) : Promise.resolve(null)),
    [candidate],
  );
  const showTrend = trend.data && trend.data.points.length >= 2;

  return (
    <DashboardWidget
      id="labs"
      title={t("dash.labs.title")}
      icon={FlaskConical}
      loading={labs.loading && !labs.data}
      error={labs.data ? null : labs.error}
      onRetry={() => void labs.reload()}
      action={
        <Link href="/labs" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-teal-700 underline">
          {t("dash.labs.viewAll")}
        </Link>
      }
    >
      {items.length === 0 ? (
        <EmptyState title={t("dash.labs.empty")}>{t("dash.labs.emptyHint")}</EmptyState>
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2">
            {items.map((l) => {
              const f = FLAG[l.flag];
              const range = formatRange(l.ref_low, l.ref_high, l.unit);
              return (
                <li key={l.id} className="min-w-0">
                  <MetricCard
                    label={l.test_name}
                    value={l.value_numeric !== null ? String(l.value_numeric) : (l.value_text ?? "–")}
                    unit={l.value_numeric !== null ? l.unit : null}
                    badge={
                      <>
                        <StatusBadge tone={f.tone} icon={f.icon}>
                          {t(`dash.flag.${l.flag}` as MessageKey)}
                        </StatusBadge>
                        <VerificationBadge status={l.verification_status} />
                      </>
                    }
                    caption={
                      <>
                        {range && <span className="block">{t("dash.labs.range", { range })}</span>}
                        <span className="block">{formatDate(l.observed_on)}</span>
                      </>
                    }
                  />
                </li>
              );
            })}
          </ul>
          {showTrend && (
            <details className="mt-3 rounded-lg border border-line p-3">
              <summary className="min-h-[44px] cursor-pointer text-sm font-semibold text-teal-700">
                {t("dash.labs.trend", { name: trend.data!.test_name })}
              </summary>
              <div className="mt-3">
                <TrendChart trend={trend.data!} />
              </div>
            </details>
          )}
          <p className="mt-3 text-xs text-ink-soft">{t("dash.labs.note")}</p>
        </>
      )}
    </DashboardWidget>
  );
}
