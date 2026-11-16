"use client";

import { useState } from "react";
import { Alert, Button, Card, EmptyState, PageLoading } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { CAN_CANCEL, STATUS_BADGE, WINDOWS, formatDate, telHref, type Appointment } from "@/lib/care";
import { useAsync } from "@/lib/hooks";
import type { Page } from "@/lib/types";

const TONE = {
  info: "bg-info-100 text-info-700",
  success: "bg-success-100 text-success-700",
  warning: "bg-amber-100 text-amber-600",
  danger: "bg-danger-100 text-danger-700",
} as const;

export function AppointmentsPanel({ version }: { version: number }) {
  const [local, setLocal] = useState(0);
  const list = useAsync(() => api<Page<Appointment>>("/appointments?limit=50"), [version, local]);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function cancel(id: string) {
    setBusy(id);
    setFailure(null);
    try {
      await api(`/appointments/${id}/cancel`, { method: "POST" });
      setLocal((n) => n + 1);
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card aria-labelledby="ap-h" className="space-y-4">
      <div>
        <h2 id="ap-h" className="text-lg font-semibold text-ink">
          Your appointment requests
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          A request is only confirmed once the clinic has replied. Requests that were saved here only have not been sent.
        </p>
      </div>
      {failure && <Alert tone="danger" title="Could not cancel">{failure}</Alert>}
      {list.loading && !list.data && <PageLoading label="Loading your requests" />}
      {list.error != null && <Alert tone="danger" title="Could not load requests">{errorMessage(list.error)}</Alert>}
      {list.data && list.data.items.length === 0 && (
        <EmptyState title="No requests yet">Find a doctor and choose Request an appointment.</EmptyState>
      )}
      <ul className="space-y-3">
        {(list.data?.items ?? []).map((a) => {
          const badge = STATUS_BADGE[a.status];
          const tel = telHref(a.doctor.phone);
          const windowLabel = WINDOWS.find((w) => w.value === a.preferred_window)?.label;
          return (
            <li key={a.id} className="space-y-2 rounded-lg border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-ink">{a.doctor.display_name}</h3>
                  <p className="text-sm text-ink-soft">
                    {formatDate(a.preferred_date)}, {windowLabel?.toLowerCase()}
                    {a.doctor.clinic_name ? `, ${a.doctor.clinic_name}` : ""}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${TONE[badge.tone]}`}>{badge.label}</span>
              </div>
              <p className="text-sm">{a.status_text}</p>
              {a.provider_message && <p className="text-sm text-ink-soft">Clinic message: {a.provider_message}</p>}
              {a.reason && <p className="text-sm text-ink-soft">Your note: {a.reason}</p>}
              <div className="flex flex-wrap items-center gap-3">
                {tel && (
                  <a href={tel} className="inline-flex min-h-[44px] items-center font-medium text-teal-700 underline">
                    Call {a.doctor.phone}
                  </a>
                )}
                {CAN_CANCEL.includes(a.status) && (
                  <Button variant="ghost" loading={busy === a.id} onClick={() => void cancel(a.id)}>
                    Cancel request
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
