"use client";

import { Activity, ChevronDown, FileText, FlaskConical, Pill, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DashboardWidget } from "@/components/dashboard/DashboardWidget";
import { Alert, Button, EmptyState } from "@/components/ui/primitives";
import { SourceBadge } from "@/components/ui/StatusBadge";
import { api, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { buildTimeline, type TimelineItem } from "@/lib/dashboard";
import { useAsync, type AsyncState } from "@/lib/hooks";
import { useT, type MessageKey } from "@/lib/i18n";
import { dayKey, dayLabel, formatInstant } from "@/lib/medications";
import { useProfile } from "@/lib/profile-context";
import { formatDate, formatLabValue, formatRange, recordTypeLabel } from "@/lib/records";
import type { Dose, HealthRecord, LabResult, Page } from "@/lib/types";

const KIND: Record<TimelineItem["kind"], { icon: LucideIcon; label: MessageKey }> = {
  record: { icon: FileText, label: "dash.tl.record" },
  lab: { icon: FlaskConical, label: "dash.tl.lab" },
  dose: { icon: Pill, label: "dash.tl.dose" },
};

const linkClass = "inline-flex min-h-[44px] items-center text-sm font-semibold text-teal-700 underline";

/**
 * Latest records, lab results and dose events the API returned, merged by date. Each row opens to
 * show its details. If one source fails the others still show, with a note.
 */
export function HealthTimeline({ doses, labs }: { doses: AsyncState<Page<Dose>>; labs: AsyncState<Page<LabResult>> }) {
  const { t } = useT();
  const { profile } = useProfile();
  const tz = profile.timezone;
  const records = useAsync(() => api<Page<HealthRecord>>("/records?limit=8"), []);
  const [open, setOpen] = useState<string | null>(null);

  const sources = [records, labs, doses];
  const failed = sources.filter((s) => s.error && !s.data);
  const loading = sources.every((s) => s.loading && !s.data);
  const items = buildTimeline(records.data?.items ?? [], labs.data?.items ?? [], doses.data?.items ?? []);
  const now = new Date();

  function when(item: TimelineItem): string {
    if (item.kind === "record") {
      const r = item.record;
      return r.record_date ? formatDate(r.record_date) : formatDate(dayKey(r.created_at, tz));
    }
    if (item.kind === "lab") return formatDate(item.lab.observed_on);
    const iso = item.dose.status === "taken" ? (item.dose.taken_at ?? item.dose.scheduled_at!) : item.dose.scheduled_at!;
    return `${dayLabel(dayKey(iso, tz), now, tz)}, ${formatInstant(iso, tz)}`;
  }

  function title(item: TimelineItem): string {
    if (item.kind === "record") return item.record.title;
    if (item.kind === "lab") return `${item.lab.test_name}: ${formatLabValue(item.lab)}`;
    return item.dose.medication_name ?? t("dash.tl.dose");
  }

  function details(item: TimelineItem) {
    if (item.kind === "record") {
      const r = item.record;
      return (
        <>
          <p>{recordTypeLabel(r.record_type)}</p>
          {r.provider_name && <p>{t("dash.tl.provider", { name: r.provider_name })}</p>}
          <SourceBadge source={r.verification_status} />
          <Link href="/records" className={linkClass}>{t("dash.tl.openRecords")}</Link>
        </>
      );
    }
    if (item.kind === "lab") {
      const l = item.lab;
      const range = formatRange(l.ref_low, l.ref_high, l.unit);
      return (
        <>
          <p>{t(`dash.flag.${l.flag}` as MessageKey)}</p>
          {range && <p className="tnum">{t("dash.labs.range", { range })}</p>}
          <SourceBadge source={l.verification_status} />
          <Link href="/labs" className={linkClass}>{t("dash.tl.openLabs")}</Link>
        </>
      );
    }
    const d = item.dose;
    return (
      <>
        <p>{t(d.status === "taken" ? "dash.dose.taken" : "dash.dose.skipped")}{d.dose_text ? ` · ${d.dose_text}` : ""}</p>
        <Link href="/medications" className={linkClass}>{t("dash.tl.openMeds")}</Link>
      </>
    );
  }

  return (
    <DashboardWidget
      id="timeline"
      title={t("dash.tl.title")}
      icon={Activity}
      rows={4}
      loading={loading}
      error={failed.length === sources.length ? failed[0]!.error : null}
      onRetry={() => void Promise.all([records.reload(), labs.reload(), doses.reload()])}
    >
      {failed.length > 0 && (
        <Alert tone="danger" className="mb-3">
          <span className="block">{errorMessage(failed[0]!.error)}</span>
          <Button variant="ghost" onClick={() => void Promise.all(failed.map((f) => f.reload()))}>
            {t("dash.error.retry")}
          </Button>
        </Alert>
      )}
      {items.length === 0 ? (
        failed.length === 0 && <EmptyState title={t("dash.tl.empty")}>{t("dash.tl.emptyHint")}</EmptyState>
      ) : (
        <ol className="divide-y divide-line rounded-lg border border-line">
          {items.map((item) => {
            const k = KIND[item.kind];
            const Icon = k.icon;
            const isOpen = open === item.id;
            const panel = `tl-${item.id}`;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panel}
                  aria-label={t("dash.tl.show", { title: title(item) })}
                  onClick={() => setOpen(isOpen ? null : item.id)}
                  className="flex min-h-[52px] w-full items-center gap-3 px-3 py-2 text-left hover:bg-mint-100"
                >
                  <Icon className="h-5 w-5 shrink-0 text-ink-soft" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-medium text-ink">{title(item)}</span>
                    <span className="block text-xs text-ink-soft tnum">
                      {t(k.label)} · {when(item)}
                    </span>
                  </span>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-ink-soft transition-transform duration-fast", isOpen && "rotate-180")} aria-hidden />
                </button>
                {isOpen && (
                  <div id={panel} className="space-y-1.5 border-t border-line bg-canvas px-3 py-3 text-sm text-ink-soft">
                    {details(item)}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </DashboardWidget>
  );
}
