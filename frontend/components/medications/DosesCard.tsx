"use client";

import { AlertTriangle, Check, CheckCircle2, Circle, Clock, Plus, RotateCcw, SkipForward, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { Alert, Button, Card, EmptyState, SelectField, Skeleton } from "@/components/ui/primitives";
import { ReadAloudButton } from "@/components/voice/ReadAloudButton";
import { api, errorMessage } from "@/lib/api-client";
import type { AsyncState } from "@/lib/hooks";
import { useT } from "@/lib/i18n";
import { dayKey, dayLabel, doseState, doseWhen, formatInstant, groupDosesByDay, type DoseState } from "@/lib/medications";
import { useProfile } from "@/lib/profile-context";
import { SPEECH_LOCALE } from "@/lib/speech";
import type { Dose, Medication, Page } from "@/lib/types";

/** Icon + words for every state; the colour only reinforces. "Overdue" is caution (amber), never red. */
const STATE_STYLE: Record<DoseState, { label: string; tone: StatusTone; icon: LucideIcon }> = {
  overdue: { label: "Overdue", tone: "caution", icon: AlertTriangle },
  due: { label: "Due now", tone: "info", icon: Clock },
  upcoming: { label: "Upcoming", tone: "neutral", icon: Circle },
  taken: { label: "Taken", tone: "success", icon: CheckCircle2 },
  skipped: { label: "Skipped", tone: "neutral", icon: SkipForward },
};

/**
 * Doses as a timeline, one day at a time. Only the person's own tap on Taken, I took it or Skip
 * changes a dose; the server decides what is overdue. Reminders never mark anything as taken.
 */
export function DosesCard({ list, meds, onChange }: { list: AsyncState<Page<Dose>>; meds: AsyncState<Page<Medication>>; onChange: () => void }) {
  const { profile } = useProfile();
  const { t, language } = useT();
  const voiceOn = profile.accessibility_preferences.voice_enabled;
  const tz = profile.timezone;
  const now = new Date();
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

  // Pending doses for today, in time order. Reading them aloud is only a reminder: the same
  // doses are on screen and only the patient’s own tap ever marks one as taken.
  const todayKey = dayKey(now, tz);
  const waiting = (list.data?.items ?? [])
    .filter((d) => d.status === "pending" && d.scheduled_at !== null && dayKey(d.scheduled_at, tz) === todayKey)
    .sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!));
  const spoken = [
    t("doses.intro"),
    ...(waiting.length === 0
      ? [t("doses.none")]
      : waiting.map((d) =>
          t("doses.line", {
            time: new Intl.DateTimeFormat(SPEECH_LOCALE[language], { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz }).format(new Date(d.scheduled_at!)),
            name: d.medication_name ?? "",
            dose: d.dose_text ? ` ${d.dose_text}` : "",
          }),
        )),
    t("doses.reminder"),
  ].join(" ");

  return (
    <Card aria-labelledby="doses-heading">
      <h2 id="doses-heading" className="mb-1 flex items-center gap-2 font-semibold text-navy-900">
        <Clock className="h-5 w-5 text-ink-soft" aria-hidden /> Your doses
      </h2>
      <p className="mb-4 text-sm text-ink-soft">
        A dose is only marked as taken when you tell us you took it. Reminders never do this for you.
      </p>
      {voiceOn && list.data && (
        <ReadAloudButton text={spoken} language={language} label={t("doses.readAloud")} className="mb-3" />
      )}
      {error && (
        <Alert tone="danger" className="mb-3">
          {error}
        </Alert>
      )}
      {list.error && !list.data ? (
        <ErrorState title="Couldn’t load your doses" onRetry={() => void list.reload()}>{errorMessage(list.error)}</ErrorState>
      ) : list.loading && !list.data ? (
        <div role="status" aria-label="Loading doses" className="space-y-2"><Skeleton variant="row" /><Skeleton variant="row" /></div>
      ) : groups.length === 0 ? (
        <EmptyState title="No doses to show">Add a medicine and a schedule, and your doses will appear here.</EmptyState>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.key} aria-label={dayLabel(g.key, now, tz)}>
              <h3 className="mb-2 text-sm font-semibold text-ink-soft">{dayLabel(g.key, now, tz)}</h3>
              <ol className="ml-2 space-y-3 border-l-2 border-line pl-4">
                {g.doses.map((d) => {
                  const state = doseState(d, now);
                  const style = STATE_STYLE[state];
                  const busy = busyId === d.id;
                  return (
                    <li key={d.id} className="relative flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3">
                      <span aria-hidden className="absolute -left-[1.4rem] top-5 h-3 w-3 rounded-full border-2 border-surface bg-teal-700" />
                      <div className="min-w-0">
                        <p className="font-medium text-ink">
                          <span className="tnum">{formatInstant(doseWhen(d), tz)}</span>
                          <span className="mx-2 text-ink-soft" aria-hidden>
                            ·
                          </span>
                          <span className="break-words">{d.medication_name}</span>
                          {d.dose_text && <span className="ml-1 text-ink-soft">{d.dose_text}</span>}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          <StatusBadge tone={style.tone} icon={style.icon}>{style.label}</StatusBadge>
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
              </ol>
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
