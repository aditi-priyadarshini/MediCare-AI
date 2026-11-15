"use client";

import { BellRing, CheckCheck } from "lucide-react";
import { Alert, Button, Card } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks";
import { ALERT_TONE, alertText } from "@/lib/medications";
import { useProfile } from "@/lib/profile-context";
import type { AppNotification, MedAlert, Page } from "@/lib/types";

/** Refill and expiry notices computed from your supplies. Always check the pack itself. */
export function AlertsCard({ version }: { version: number }) {
  const alerts = useAsync(() => api<MedAlert[]>("/medications/alerts"), [version]);
  if (alerts.error || !alerts.data || alerts.data.length === 0) {
    return alerts.error ? <Alert tone="danger">{errorMessage(alerts.error)}</Alert> : null;
  }
  return (
    <Card aria-labelledby="alerts-heading" className="space-y-2">
      <h2 id="alerts-heading" className="font-semibold text-navy-900">
        Supply alerts
      </h2>
      {alerts.data.map((a) => (
        <Alert key={`${a.kind}-${a.supply_id ?? a.medication_id}`} tone={ALERT_TONE[a.kind]} title={a.kind === "refill_soon" ? "Running low" : a.kind === "out_of_stock" ? "Out of stock" : a.kind === "expiring_soon" ? "Expiring soon" : "Expired"}>
          {alertText(a)}
        </Alert>
      ))}
      <p className="text-xs text-ink-soft">
        These come from the amounts and dates you entered. Always check the date printed on the pack, and ask a pharmacist
        if you’re unsure about using an expired medicine.
      </p>
    </Card>
  );
}

export function RemindersCard({ version, onChange }: { version: number; onChange: () => void }) {
  const { profile } = useProfile();
  const feed = useAsync(() => api<Page<AppNotification>>("/notifications?limit=10"), [version]);
  const items = feed.data?.items ?? [];
  const unread = items.filter((n) => n.read_at === null).length;

  async function markAll() {
    await api("/notifications/read-all", { method: "POST" });
    onChange();
  }
  async function markOne(id: string) {
    await api(`/notifications/${id}/read`, { method: "POST" });
    onChange();
  }

  if (feed.error) return <Alert tone="danger">{errorMessage(feed.error)}</Alert>;
  if (!feed.data || items.length === 0) return null;
  return (
    <Card aria-labelledby="reminders-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="reminders-heading" className="flex items-center gap-2 font-semibold text-navy-900">
          <BellRing className="h-5 w-5 text-ink-soft" aria-hidden /> Reminders
          {unread > 0 && <span className="rounded-full bg-info-100 px-2 text-xs font-medium text-info-700">{unread} new</span>}
        </h2>
        {unread > 0 && (
          <Button variant="ghost" onClick={() => void markAll()}>
            <CheckCheck className="h-4 w-4" aria-hidden /> Mark all read
          </Button>
        )}
      </div>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {items.map((n) => (
          <li key={n.id} className="flex flex-wrap items-start justify-between gap-2 p-3">
            <div className="min-w-0">
              <p className={n.read_at === null ? "font-medium text-ink" : "text-ink-soft"}>{n.title}</p>
              <p className="text-sm text-ink-soft">{n.body}</p>
              <p className="mt-1 text-xs text-ink-soft">
                {new Date(n.due_at).toLocaleString("en-IN", {
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: profile.timezone,
                })}
              </p>
            </div>
            {n.read_at === null && (
              <Button variant="ghost" onClick={() => void markOne(n.id)} aria-label={`Mark “${n.title}” as read`}>
                Mark read
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
