"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Alert, Button, CheckboxField, EmptyState, SelectField, Skeleton, TextField } from "@/components/ui/primitives";
import { api, errorMessage, fieldErrors } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks";
import { normaliseTimes, scheduleSummary, WEEKDAYS } from "@/lib/medications";
import { useProfile } from "@/lib/profile-context";
import { formatDate, parseNumber, todayISO } from "@/lib/records";
import type { Medication, Schedule, Supply } from "@/lib/types";

type Repeat = "daily" | "weekdays" | "interval";

const REPEAT_OPTIONS = [
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Certain days of the week" },
  { value: "interval", label: "Every few days" },
];

/* --------------------------------------------------------------- schedules */
function ScheduleForm({ med, onDone }: { med: Medication; onDone: () => void }) {
  const { profile } = useProfile();
  const [times, setTimes] = useState<string[]>(["08:00"]);
  const [repeat, setRepeat] = useState<Repeat>("daily");
  const [days, setDays] = useState<number[]>([]);
  const [every, setEvery] = useState("2");
  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    const t = normaliseTimes(times);
    if (t.error) next.times = t.error;
    if (repeat === "weekdays" && days.length === 0) next.days = "Choose at least one day.";
    const n = parseNumber(every);
    if (repeat === "interval" && (n === null || !Number.isInteger(n) || n < 2 || n > 365)) {
      next.every = "Enter a whole number from 2 to 365.";
    }
    if (!start) next.start = "Choose a start date.";
    if (end && start && end < start) next.end = "The end date can’t be before the start date.";
    setErrors(next);
    setFailure(null);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await api<Schedule>(`/medications/${med.id}/schedules`, {
        method: "POST",
        body: {
          times: t.times,
          days_of_week: repeat === "weekdays" ? [...days].sort() : null,
          every_n_days: repeat === "interval" ? n : 1,
          start_date: start,
          end_date: end || null,
        },
      });
      onDone();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFailure(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4 rounded-lg border border-line p-3">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">Times each day</legend>
        {times.map((t, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="time"
              aria-label={`Time ${i + 1}`}
              value={t}
              onChange={(e) => setTimes((all) => all.map((x, j) => (j === i ? e.target.value : x)))}
              className="min-h-[44px] rounded-lg border border-line bg-surface px-3 text-base"
            />
            {times.length > 1 && (
              <Button variant="ghost" aria-label={`Remove time ${i + 1}`} onClick={() => setTimes((all) => all.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            )}
          </div>
        ))}
        {times.length < 6 && (
          <Button variant="ghost" onClick={() => setTimes((all) => [...all, "20:00"])}>
            <Plus className="h-4 w-4" aria-hidden /> Add another time
          </Button>
        )}
        {errors.times && <p className="text-xs font-medium text-danger-700">{errors.times}</p>}
        <p className="text-xs text-ink-soft">Times use your time zone ({profile.timezone}).</p>
      </fieldset>

      <SelectField label="How often" value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)} options={REPEAT_OPTIONS} />
      {repeat === "weekdays" && (
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-ink">Days</legend>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((label, i) => (
              <CheckboxField
                key={label}
                label={label}
                checked={days.includes(i)}
                onChange={(e) => setDays((all) => (e.target.checked ? [...all, i] : all.filter((d) => d !== i)))}
              />
            ))}
          </div>
          {errors.days && <p className="mt-1 text-xs font-medium text-danger-700">{errors.days}</p>}
        </fieldset>
      )}
      {repeat === "interval" && (
        <TextField label="Every how many days" inputMode="numeric" value={every} onChange={(e) => setEvery(e.target.value)} error={errors.every} />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Starts" type="date" value={start} onChange={(e) => setStart(e.target.value)} error={errors.start_date ?? errors.start} />
        <TextField label="Ends" optional type="date" value={end} onChange={(e) => setEnd(e.target.value)} error={errors.end_date ?? errors.end} />
      </div>
      {failure && <Alert tone="danger">{failure}</Alert>}
      <Button type="submit" loading={busy}>
        Save schedule
      </Button>
    </form>
  );
}

function Schedules({ med, onChange }: { med: Medication; onChange: () => void }) {
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
      {list.loading && !list.data ? (
        <Skeleton className="h-10 w-full" />
      ) : list.data && list.data.length > 0 ? (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {list.data.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span className={s.is_active ? "text-ink" : "text-ink-soft line-through"}>{scheduleSummary(s)}</span>
              <Button variant="ghost" onClick={() => void toggle(s)}>
                {s.is_active ? "Turn off" : "Turn on"}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={med.as_needed ? "Taken only when needed" : "No schedule yet"}>
          {med.as_needed ? "You can log a dose any time from the list above." : "Add times to get reminders."}
        </EmptyState>
      )}
      {adding ? (
        <ScheduleForm
          med={med}
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

/* ---------------------------------------------------------------- supplies */
function SupplyForm({ med, onDone }: { med: Medication; onDone: () => void }) {
  const [form, setForm] = useState({ lot: "", maker: "", expiry: "", qty: "", unit: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const qty = parseNumber(form.qty);
    const next: Record<string, string> = {};
    if (qty === null || Number.isNaN(qty) || qty <= 0) next.quantity_initial = "Enter how many you have, such as 30.";
    setErrors(next);
    setFailure(null);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await api<Supply>(`/medications/${med.id}/supplies`, {
        method: "POST",
        body: {
          lot_number: form.lot.trim() || null,
          manufacturer: form.maker.trim() || null,
          expiry_date: form.expiry || null,
          quantity_initial: qty,
          unit: form.unit.trim() || null,
        },
      });
      onDone();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFailure(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="grid gap-4 rounded-lg border border-line p-3 sm:grid-cols-2">
      <TextField label="How many" inputMode="decimal" value={form.qty} onChange={(e) => set("qty", e.target.value)} error={errors.quantity_initial} hint="Tablets, ml or doses in this pack" />
      <TextField label="Unit" optional value={form.unit} onChange={(e) => set("unit", e.target.value)} maxLength={16} hint="For example: tablets" />
      <TextField label="Expiry date" optional type="date" value={form.expiry} onChange={(e) => set("expiry", e.target.value)} error={errors.expiry_date} />
      <TextField label="Batch or lot number" optional value={form.lot} onChange={(e) => set("lot", e.target.value)} maxLength={64} hint="Printed on the pack" />
      <div className="sm:col-span-2">
        <TextField label="Maker" optional value={form.maker} onChange={(e) => set("maker", e.target.value)} maxLength={200} />
      </div>
      {failure && (
        <div className="sm:col-span-2">
          <Alert tone="danger">{failure}</Alert>
        </div>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" loading={busy}>
          Save supply
        </Button>
      </div>
    </form>
  );
}

function SupplyRow({ s, onChange }: { s: Supply; onChange: () => void }) {
  const [count, setCount] = useState(String(s.quantity_remaining));
  const [error, setError] = useState<string | null>(null);

  async function patch(body: unknown) {
    setError(null);
    try {
      await api<Supply>(`/supplies/${s.id}`, { method: "PATCH", body });
      onChange();
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  const n = parseNumber(count);
  return (
    <li className="space-y-2 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-ink">
          {s.lot_number ? `Lot ${s.lot_number}` : "Supply"}
          {s.manufacturer ? ` · ${s.manufacturer}` : ""}
          <span className="ml-2 text-ink-soft">{s.expiry_date ? `Expires ${formatDate(s.expiry_date)}` : "No expiry date"}</span>
        </p>
        <Button variant="ghost" onClick={() => void patch({ status: "discarded" })}>
          Remove
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-32">
          <TextField label={`Left${s.unit ? ` (${s.unit})` : ""}`} inputMode="decimal" value={count} onChange={(e) => setCount(e.target.value)} />
        </div>
        <Button
          variant="secondary"
          disabled={n === null || Number.isNaN(n) || n < 0 || n === s.quantity_remaining}
          onClick={() => void patch({ quantity_remaining: n })}
        >
          Update count
        </Button>
        <span className="pb-3 text-xs text-ink-soft">of {s.quantity_initial} to start</span>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
    </li>
  );
}

function Supplies({ med, onChange }: { med: Medication; onChange: () => void }) {
  const list = useAsync(() => api<Supply[]>(`/medications/${med.id}/supplies`), []);
  const [adding, setAdding] = useState(false);
  const refresh = () => {
    void list.reload();
    onChange();
  };
  return (
    <section aria-label="Supplies" className="space-y-3">
      <h4 className="text-sm font-semibold text-navy-900">Supply on hand</h4>
      {list.loading && !list.data ? (
        <Skeleton className="h-10 w-full" />
      ) : list.data && list.data.length > 0 ? (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {list.data.map((s) => (
            <SupplyRow key={`${s.id}-${s.quantity_remaining}`} s={s} onChange={refresh} />
          ))}
        </ul>
      ) : (
        <EmptyState title="No supply recorded">Add a pack to get refill and expiry alerts.</EmptyState>
      )}
      {adding ? (
        <SupplyForm
          med={med}
          onDone={() => {
            setAdding(false);
            refresh();
          }}
        />
      ) : (
        <Button variant="secondary" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" aria-hidden /> Add a pack
        </Button>
      )}
      <p className="text-xs text-ink-soft">Taking a dose uses up stock from the pack that expires first. Undoing a dose puts it back.</p>
    </section>
  );
}

export function MedicationDetails({ med, onChange }: { med: Medication; onChange: () => void }) {
  return (
    <div className="space-y-6 border-t border-line pt-4">
      {med.instructions && <p className="text-sm text-ink-soft">{med.instructions}</p>}
      <Schedules med={med} onChange={onChange} />
      <Supplies med={med} onChange={onChange} />
    </div>
  );
}
