"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { ScheduleFields } from "@/components/medications/ScheduleFields";
import { ErrorState } from "@/components/ui/ErrorState";
import { Alert, Button, EmptyState, Skeleton } from "@/components/ui/primitives";
import { api, errorMessage, fieldErrors } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks";
import { defaultScheduleDraft, scheduleDraftToBody, scheduleSummary } from "@/lib/medications";
import { useProfile } from "@/lib/profile-context";
import { todayISO } from "@/lib/records";
import type { Medication, Schedule } from "@/lib/types";

function ScheduleForm({ med, onDone, onCancel }: { med: Medication; onDone: () => void; onCancel: () => void }) {
  const { profile } = useProfile();
  const [draft, setDraft] = useState(() => defaultScheduleDraft(todayISO()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { errors: found, body } = scheduleDraftToBody(draft);
    setErrors(found);
    setFailure(null);
    if (!body) return;
    setBusy(true);
    try {
      await api<Schedule>(`/medications/${med.id}/schedules`, { method: "POST", body });
      onDone();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFailure(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate aria-label="New schedule" className="space-y-4 rounded-lg border border-line p-3">
      <ScheduleFields draft={draft} setDraft={setDraft} errors={errors} timezone={profile.timezone} />
      {failure && <Alert tone="danger">{failure}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy}>
          Save schedule
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function Schedules({ med, onChange }: { med: Medication; onChange: () => void }) {
  const list = useAsync(() => api<Schedule[]>(`/medications/${med.id}/schedules`), []);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(s: Schedule) {
    setError(null);
    try {
      await api<Schedule>(`/schedules/${s.id}`, { method: "PATCH", body: { is_active: !s.is_active } });
      await list.reload();
      onChange();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section aria-label="Schedules" className="space-y-3">
      <h4 className="text-sm font-semibold text-navy-900">Schedule</h4>
      {error && <Alert tone="danger">{error}</Alert>}
      {list.error && !list.data ? (
        <ErrorState title="Couldn’t load the schedule" onRetry={() => void list.reload()}>{errorMessage(list.error)}</ErrorState>
      ) : list.loading && !list.data ? (
        <Skeleton className="h-10 w-full" />
      ) : list.data && list.data.length > 0 ? (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {list.data.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span className={s.is_active ? "text-ink tnum" : "text-ink-soft line-through tnum"}>
                {scheduleSummary(s)}
                {!s.is_active && <span className="ml-2 no-underline">(off)</span>}
              </span>
              <Button variant="ghost" onClick={() => void toggle(s)}>
                {s.is_active ? "Turn off" : "Turn on"}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={med.as_needed ? "Taken only when needed" : "No schedule yet"}>
          {med.as_needed ? "You can log a dose any time from the doses list." : "Add times to get reminders."}
        </EmptyState>
      )}
      {adding ? (
        <ScheduleForm
          med={med}
          onCancel={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            void list.reload();
            onChange();
          }}
        />
      ) : (
        <Button variant="secondary" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" aria-hidden /> Add a schedule
        </Button>
      )}
    </section>
  );
}
