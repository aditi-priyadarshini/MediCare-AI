"use client";

import { Check, Clock, Plus, RotateCcw, SkipForward } from "lucide-react";
import { useState } from "react";
import { Alert, Button, Card, EmptyState, SelectField, Skeleton } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { useAsync } from "@/lib/hooks";
import { dayLabel, doseState, doseWhen, formatInstant, groupDosesByDay, type DoseState } from "@/lib/medications";
import { useProfile } from "@/lib/profile-context";
import type { Dose, Medication, Page } from "@/lib/types";

const STATE_STYLE: Record<DoseState, { label: string; cls: string }> = {
  overdue: { label: "Overdue", cls: "bg-amber-100 text-amber-600" },
  due: { label: "Due now", cls: "bg-info-100 text-info-700" },
  upcoming: { label: "Upcoming", cls: "bg-mint-100 text-teal-700" },
  taken: { label: "Taken", cls: "bg-success-100 text-success-700" },
  skipped: { label: "Skipped", cls: "bg-line text-ink-soft" },
};

const DAY = 86_400_000;

export function DosesCard({ version, onChange }: { version: number; onChange: () => void }) {
  const { profile } = useProfile();
  const tz = profile.timezone;
  const now = new Date();
  const list = useAsync(() => {
    const from = new Date(Date.now() - DAY).toISOString();
    const to = new Date(Date.now() + 2 * DAY).toISOString();
    return api<Page<Dose>>(`/doses?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=100`);
  }, [version]);
  const meds = useAsync(() => api<Page<Medication>>("/medications?limit=100"), [version]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extraMed, setExtraMed] = useState("");

  async function act(id: string, path: string, body?: unknown) {
    setBusyId(id);
    setError(null);
    try {
      await api<Dose>(`/doses/${id}/${path}`, { method: "POST", body });
      onChange();
    } catch (err) {
      setError(errorMessage(err));
      await list.reload();
    } finally {
      setBusyId(null);
    }
  }

  async function logExtra() {
    if (!extraMed) return;
    setBusyId("extra");
    setError(null);
    try {
      await api<Dose>("/doses", { method: "POST", body: { medication_id: extraMed } });
      setExtraMed("");
      onChange();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const groups = list.data ? groupDosesByDay(list.data.items, tz) : [];
  const active = (meds.data?.items ?? []).filter((m) => m.status === "active");
  const medOptions = [{ value: "", label: "Choose a medicine" }, ...active.map((m) => ({ value: m.id, label: m.display_name }))];

  return (
    <Card aria-labelledby="doses-heading">
      <h2 id="doses-heading" className="mb-1 flex items-center gap-2 font-semibold text-navy-900">
        <Clock className="h-5 w-5 text-ink-soft" aria-hidden /> Your doses
      </h2>
      <p className="mb-4 text-sm text-ink-soft">
        A dose is only marked as taken when you tell us you took it. Reminders never do this for you.
      </p>
      {error && (
        <Alert tone="danger" className="mb-3">
          {error}
        </Alert>
      )}
      {list.error ? (
        <Alert tone="danger">{errorMessage(list.error)}</Alert>
      ) : list.loading && !list.data ? (
        <Skeleton className="h-24 w-full" />
      ) : groups.length === 0 ? (
        <EmptyState title="No doses to show">Add a medicine and a schedule below, and your doses will appear here.</EmptyState>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.key} aria-label={dayLabel(g.key, now, tz)}>
              <h3 className="mb-2 text-sm font-semibold text-ink-soft">{dayLabel(g.key, now, tz)}</h3>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {g.doses.map((d) => {
                  const state = doseState(d, now);
                  const style = STATE_STYLE[state];
                  const busy = busyId === d.id;
                  return (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">
                          <span className="tabular-nums">{formatInstant(doseWhen(d), tz)}</span>
                          <span className="mx-2 text-ink-soft" aria-hidden>
                            ·
                          </span>
                          <span className="break-words">{d.medication_name}</span>
                          {d.dose_text && <span className="ml-1 text-ink-soft">{d.dose_text}</span>}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          <span className={cn("rounded-full px-2 py-0.5 font-medium", style.cls)}>{style.label}</span>
                          {d.scheduled_at === null && <span className="text-ink-soft">Extra dose</span>}
                          {d.status === "taken" && d.taken_at && d.scheduled_at !== null && (
                            <span className="text-ink-soft">at {formatInstant(d.taken_at, tz)}</span>
                          )}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {d.status === "pending" && (
                          <>
                            <Button loading={busy} onClick={() => void act(d.id, "take", {})} aria-label={`Mark ${d.medication_name} as taken`}>
                              <Check className="h-4 w-4" aria-hidden /> Taken
                            </Button>
                            <Button variant="secondary" disabled={busy} onClick={() => void act(d.id, "skip", {})} aria-label={`Skip ${d.medication_name}`}>
                              <SkipForward className="h-4 w-4" aria-hidden /> Skip
                            </Button>
                          </>
                        )}
                        {d.status === "skipped" && (
                          <Button variant="secondary" loading={busy} onClick={() => void act(d.id, "take", {})}>
                            <Check className="h-4 w-4" aria-hidden /> I took it
                          </Button>
                        )}
                        {d.scheduled_at !== null && d.status !== "pending" && (
                          <Button variant="ghost" disabled={busy} onClick={() => void act(d.id, "reset")} aria-label={`Undo ${d.medication_name}`}>
                            <RotateCcw className="h-4 w-4" aria-hidden /> Undo
                          </Button>
                        )}
                        {d.scheduled_at === null && (
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() => {
                              setBusyId(d.id);
                              api(`/doses/${d.id}`, { method: "DELETE" })
                                .then(onChange)
                                .catch((err: unknown) => setError(errorMessage(err)))
                                .finally(() => setBusyId(null));
                            }}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {active.length > 0 && (
        <div className="mt-6 flex flex-wrap items-end gap-3 border-t border-line pt-4">
          <div className="min-w-[14rem] flex-1">
            <SelectField label="Took something that wasn’t scheduled?" value={extraMed} onChange={(e) => setExtraMed(e.target.value)} options={medOptions} />
          </div>
          <Button variant="secondary" disabled={!extraMed} loading={busyId === "extra"} onClick={() => void logExtra()}>
            <Plus className="h-4 w-4" aria-hidden /> Log it now
          </Button>
        </div>
      )}
    </Card>
  );
}
