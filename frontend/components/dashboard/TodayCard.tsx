"use client";

import { Check, Clock, SkipForward } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DashboardWidget } from "@/components/dashboard/DashboardWidget";
import { Alert, Button, EmptyState } from "@/components/ui/primitives";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { api, errorMessage } from "@/lib/api-client";
import { todaysDoses } from "@/lib/dashboard";
import type { AsyncState } from "@/lib/hooks";
import { useT, type MessageKey } from "@/lib/i18n";
import { doseState, doseWhen, formatInstant, type DoseState } from "@/lib/medications";
import { useProfile } from "@/lib/profile-context";
import type { Dose, Page } from "@/lib/types";

const STATE: Record<DoseState, { key: MessageKey; tone: StatusTone }> = {
  overdue: { key: "dash.dose.overdue", tone: "caution" },
  due: { key: "dash.dose.due", tone: "info" },
  upcoming: { key: "dash.dose.upcoming", tone: "neutral" },
  taken: { key: "dash.dose.taken", tone: "success" },
  skipped: { key: "dash.dose.skipped", tone: "neutral" },
};

/**
 * Today's doses. "Taken" and "Skip" call the same endpoints as the Medications page and only ever
 * run from the person's own tap; nothing here marks a dose automatically.
 */
export function TodayCard({ doses }: { doses: AsyncState<Page<Dose>> }) {
  const { t } = useT();
  const { profile } = useProfile();
  const tz = profile.timezone;
  const now = new Date();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = doses.data ? todaysDoses(doses.data.items, tz, now) : [];

  async function act(id: string, path: "take" | "skip") {
    setBusyId(id);
    setError(null);
    try {
      await api<Dose>(`/doses/${id}/${path}`, { method: "POST", body: {} });
      await doses.reload();
    } catch (e) {
      setError(errorMessage(e));
      await doses.reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <DashboardWidget
      id="today"
      title={t("dash.today.title")}
      icon={Clock}
      loading={doses.loading && !doses.data}
      error={doses.data ? null : doses.error}
      onRetry={() => void doses.reload()}
      action={
        <Link href="/medications" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-teal-700 underline">
          {t("dash.today.all")}
        </Link>
      }
    >
      {error && (
        <Alert tone="danger" className="mb-3">
          {error}
        </Alert>
      )}
      {today.length === 0 ? (
        <EmptyState
          title={t("dash.today.empty")}
          action={
            <Link
              href="/medications"
              className="inline-flex min-h-control items-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-brand-900"
            >
              {t("dash.today.add")}
            </Link>
          }
        >
          {t("dash.today.emptyHint")}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {today.map((d) => {
            const state = doseState(d, now);
            const s = STATE[state];
            const busy = busyId === d.id;
            const name = d.medication_name ?? "";
            return (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    <span className="tnum">{formatInstant(doseWhen(d), tz)}</span>
                    <span className="mx-2 text-ink-soft" aria-hidden>
                      ·
                    </span>
                    <span className="break-words">{name}</span>
                    {d.dose_text && <span className="ml-1 text-ink-soft">{d.dose_text}</span>}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                    <StatusBadge tone={s.tone}>{t(s.key)}</StatusBadge>
                    {d.status === "taken" && d.taken_at && <span className="tnum">{t("dash.today.at", { time: formatInstant(d.taken_at, tz) })}</span>}
                  </p>
                </div>
                {d.status === "pending" && (
                  <div className="flex flex-wrap gap-2">
                    <Button loading={busy} onClick={() => void act(d.id, "take")} aria-label={t("dash.today.takeAria", { name })}>
                      <Check className="h-4 w-4" aria-hidden /> {t("dash.today.take")}
                    </Button>
                    <Button variant="secondary" disabled={busy} onClick={() => void act(d.id, "skip")} aria-label={t("dash.today.skipAria", { name })}>
                      <SkipForward className="h-4 w-4" aria-hidden /> {t("dash.today.skip")}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-xs text-ink-soft">{t("dash.today.note")}</p>
    </DashboardWidget>
  );
}
