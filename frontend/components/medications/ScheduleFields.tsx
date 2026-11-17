"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button, CheckboxField, SelectField, TextField } from "@/components/ui/primitives";
import { WEEKDAYS, type Repeat, type ScheduleDraft } from "@/lib/medications";

const REPEAT_OPTIONS = [
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Certain days of the week" },
  { value: "interval", label: "Every few days" },
];

/**
 * The fields of a schedule: times, how often, start and end. Used when adding a schedule to an
 * existing medicine and in the add-medicine flow. Times are in the person's profile time zone, and
 * the form says so.
 */
export function ScheduleFields({
  draft,
  setDraft,
  errors,
  timezone,
}: {
  draft: ScheduleDraft;
  setDraft: (updater: (d: ScheduleDraft) => ScheduleDraft) => void;
  errors: Record<string, string>;
  timezone: string;
}) {
  const set = <K extends keyof ScheduleDraft>(k: K, v: ScheduleDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">Times each day</legend>
        {draft.times.map((t, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="time"
              aria-label={`Time ${i + 1}`}
              value={t}
              onChange={(e) => set("times", draft.times.map((x, j) => (j === i ? e.target.value : x)))}
              className="min-h-[44px] rounded-lg border border-line bg-surface px-3 text-base tnum"
            />
            {draft.times.length > 1 && (
              <Button variant="ghost" aria-label={`Remove time ${i + 1}`} onClick={() => set("times", draft.times.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            )}
          </div>
        ))}
        {draft.times.length < 6 && (
          <Button variant="ghost" onClick={() => set("times", [...draft.times, "20:00"])}>
            <Plus className="h-4 w-4" aria-hidden /> Add another time
          </Button>
        )}
        {errors.times && <p role="alert" className="text-xs font-medium text-danger-700">{errors.times}</p>}
        <p className="text-xs text-ink-soft">Times use your time zone ({timezone}).</p>
      </fieldset>

      <SelectField label="How often" value={draft.repeat} onChange={(e) => set("repeat", e.target.value as Repeat)} options={REPEAT_OPTIONS} />
      {draft.repeat === "weekdays" && (
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-ink">Days</legend>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((label, i) => (
              <CheckboxField
                key={label}
                label={label}
                checked={draft.days.includes(i)}
                onChange={(e) => set("days", e.target.checked ? [...draft.days, i] : draft.days.filter((d) => d !== i))}
              />
            ))}
          </div>
          {errors.days && <p role="alert" className="mt-1 text-xs font-medium text-danger-700">{errors.days}</p>}
        </fieldset>
      )}
      {draft.repeat === "interval" && (
        <TextField label="Every how many days" inputMode="numeric" value={draft.every} onChange={(e) => set("every", e.target.value)} error={errors.every} />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Starts" type="date" value={draft.start} onChange={(e) => set("start", e.target.value)} error={errors.start_date ?? errors.start} />
        <TextField label="Ends" optional type="date" value={draft.end} onChange={(e) => set("end", e.target.value)} error={errors.end_date ?? errors.end} />
      </div>
    </div>
  );
}
