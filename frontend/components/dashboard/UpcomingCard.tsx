"use client";

import { CalendarClock } from "lucide-react";
import Link from "next/link";
import { DashboardWidget } from "@/components/dashboard/DashboardWidget";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api-client";
import { STATUS_BADGE, WINDOWS, type Appointment } from "@/lib/care";
import { upcomingRequests } from "@/lib/dashboard";
import { useAsync } from "@/lib/hooks";
import { useT } from "@/lib/i18n";
import { formatDate, todayISO } from "@/lib/records";
import type { Page } from "@/lib/types";

const TONE = { info: "info", success: "success", warning: "caution", danger: "danger" } as const;

/** Appointment *requests* from GET /appointments. Hidden while loading and when there are none. */
export function UpcomingCard() {
  const { t } = useT();
  const list = useAsync(() => api<Page<Appointment>>("/appointments?limit=50"), []);
  if (list.loading && !list.data) return null;
  const items = list.data ? upcomingRequests(list.data.items, todayISO()) : [];
  if (!list.error && items.length === 0) return null;

  return (
    <DashboardWidget
      id="upcoming"
      title={t("dash.up.title")}
      icon={CalendarClock}
      error={list.data ? null : list.error}
      onRetry={() => void list.reload()}
      action={
        <Link href="/care" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-teal-700 underline">
          {t("dash.up.viewAll")}
        </Link>
      }
    >
      <ul className="space-y-2">
        {items.map((a) => {
          const badge = STATUS_BADGE[a.status];
          return (
            <li key={a.id} className="rounded-lg border border-line p-3">
              <p className="break-words font-medium text-ink">{a.doctor.display_name}</p>
              <p className="text-sm text-ink-soft tnum">
                {formatDate(a.preferred_date)} · {WINDOWS.find((w) => w.value === a.preferred_window)?.label}
                {a.doctor.clinic_name ? ` · ${a.doctor.clinic_name}` : ""}
              </p>
              <div className="mt-1.5">
                <StatusBadge tone={TONE[badge.tone]}>{badge.label}</StatusBadge>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-ink-soft">{t("dash.up.note")}</p>
    </DashboardWidget>
  );
}
