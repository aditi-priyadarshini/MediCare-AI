"use client";

import { BellRing, Info } from "lucide-react";
import { DashboardWidget } from "@/components/dashboard/DashboardWidget";
import { Alert, Button } from "@/components/ui/primitives";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { api, errorMessage } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks";
import { useT, type MessageKey } from "@/lib/i18n";
import { alertText } from "@/lib/medications";
import { useNotifications } from "@/lib/notifications";
import type { AlertKind, MedAlert } from "@/lib/types";

const KIND: Record<AlertKind, { key: MessageKey; tone: StatusTone }> = {
  refill_soon: { key: "dash.alert.refill", tone: "caution" },
  out_of_stock: { key: "dash.alert.out", tone: "danger" },
  expiring_soon: { key: "dash.alert.expiring", tone: "caution" },
  expired: { key: "dash.alert.expired", tone: "danger" },
};

/** Supply alerts (GET /medications/alerts) and unread reminders. Each source can fail on its own. */
export function AttentionCard() {
  const { t } = useT();
  const alerts = useAsync(() => api<MedAlert[]>("/medications/alerts"), []);
  const notes = useNotifications();
  const unread = notes.items.filter((n) => n.read_at === null).slice(0, 5);
  const loading = alerts.loading && !alerts.data && notes.loading;
  const bothFailed = Boolean(alerts.error) && Boolean(notes.error);
  const empty = !alerts.error && !notes.error && (alerts.data?.length ?? 0) === 0 && unread.length === 0;

  return (
    <DashboardWidget
      id="attention"
      title={t("dash.attn.title")}
      icon={BellRing}
      loading={loading}
      error={bothFailed ? alerts.error : null}
      onRetry={() => void Promise.all([alerts.reload(), notes.reload()])}
    >
      {notes.actionError && (
        <Alert tone="danger" className="mb-3">
          {notes.actionError}
        </Alert>
      )}
      {Boolean(alerts.error) && (
        <Alert tone="danger" className="mb-3">
          <span className="block">{errorMessage(alerts.error)}</span>
          <Button variant="ghost" onClick={() => void alerts.reload()}>
            {t("dash.error.retry")}
          </Button>
        </Alert>
      )}
      {notes.error && (
        <Alert tone="danger" className="mb-3">
          <span className="block">{notes.error}</span>
          <Button variant="ghost" onClick={() => void notes.reload()}>
            {t("dash.error.retry")}
          </Button>
        </Alert>
      )}
      {empty ? (
        <p className="flex items-center gap-2 text-sm text-ink-soft">
          <Info className="h-4 w-4 shrink-0" aria-hidden /> {t("dash.attn.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {(alerts.data ?? []).map((a) => {
            const k = KIND[a.kind];
            return (
              <li key={`${a.kind}-${a.supply_id ?? a.medication_id}`} className="rounded-lg border border-line p-3">
                <StatusBadge tone={k.tone}>{t(k.key)}</StatusBadge>
                <p className="mt-1.5 text-sm text-ink">{alertText(a)}</p>
              </li>
            );
          })}
          {unread.map((n) => (
            <li key={n.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-line p-3">
              <div className="min-w-0">
                <StatusBadge tone="info" icon={BellRing}>
                  {t("dash.attn.reminder")}
                </StatusBadge>
                <p className="mt-1.5 text-sm font-medium text-ink">{n.title}</p>
                <p className="text-sm text-ink-soft">{n.body}</p>
              </div>
              <Button variant="ghost" onClick={() => void notes.markRead(n.id)} aria-label={t("dash.attn.markReadAria", { title: n.title })}>
                {t("dash.attn.markRead")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {(alerts.data?.length ?? 0) > 0 && <p className="mt-3 text-xs text-ink-soft">{t("dash.attn.note")}</p>}
    </DashboardWidget>
  );
}
