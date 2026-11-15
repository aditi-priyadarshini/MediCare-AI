import type { AlertKind, Dose, MedAlert, Medication, Schedule } from "./types";

/** Monday = 0, matching the API. */
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const FORMS = [
  { value: "", label: "Not sure" },
  { value: "tablet", label: "Tablet" },
  { value: "capsule", label: "Capsule" },
  { value: "syrup", label: "Syrup or liquid" },
  { value: "inhaler", label: "Inhaler" },
  { value: "drops", label: "Drops" },
  { value: "cream", label: "Cream or ointment" },
  { value: "injection", label: "Injection" },
  { value: "other", label: "Other" },
];

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isHHMM = (v: string) => HHMM.test(v);

/** Clean a list of time inputs: drop blanks and duplicates, sort, and flag invalid entries. */
export function normaliseTimes(raw: string[]): { times: string[]; error: string | null } {
  const filled = raw.map((t) => t.trim()).filter(Boolean);
  if (filled.length === 0) return { times: [], error: "Add at least one time." };
  if (filled.some((t) => !isHHMM(t))) return { times: [], error: "Enter each time as hours and minutes." };
  return { times: [...new Set(filled)].sort(), error: null };
}

export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h! >= 12 ? "pm" : "am";
  const hour = h! % 12 === 0 ? 12 : h! % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function scheduleSummary(s: Pick<Schedule, "times" | "days_of_week" | "every_n_days">): string {
  const times = s.times.map(formatClock).join(", ");
  let when = "every day";
  if (s.every_n_days > 1) when = `every ${s.every_n_days} days`;
  else if (s.days_of_week && s.days_of_week.length < 7) when = s.days_of_week.map((d) => WEEKDAYS[d]).join(", ");
  return `${times} · ${when}`;
}

/** Wall-clock time of an instant in a time zone, e.g. "8:30 am". */
export function formatInstant(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone }).format(
    new Date(iso),
  );
}

/** Calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function dayKey(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    typeof iso === "string" ? new Date(iso) : iso,
  );
}

export function dayLabel(key: string, now: Date, timeZone: string): string {
  const today = dayKey(now, timeZone);
  const shift = (days: number) => dayKey(new Date(now.getTime() + days * 86_400_000), timeZone);
  if (key === today) return "Today";
  if (key === shift(1)) return "Tomorrow";
  if (key === shift(-1)) return "Yesterday";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** The moment a dose belongs on the timeline: when it was due, or when an extra dose was taken. */
export const doseWhen = (d: Pick<Dose, "scheduled_at" | "taken_at">): string => (d.scheduled_at ?? d.taken_at)!;

export function groupDosesByDay(doses: Dose[], timeZone: string): Array<{ key: string; doses: Dose[] }> {
  const sorted = [...doses].sort((a, b) => Date.parse(doseWhen(a)) - Date.parse(doseWhen(b)));
  const groups: Array<{ key: string; doses: Dose[] }> = [];
  for (const d of sorted) {
    const key = dayKey(doseWhen(d), timeZone);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.doses.push(d);
    else groups.push({ key, doses: [d] });
  }
  return groups;
}

export type DoseState = "overdue" | "due" | "upcoming" | "taken" | "skipped";

/** What to show for a dose. "Taken" only ever comes from the server's status. */
export function doseState(d: Pick<Dose, "status" | "overdue" | "scheduled_at">, now: Date): DoseState {
  if (d.status === "taken") return "taken";
  if (d.status === "skipped") return "skipped";
  if (d.overdue) return "overdue";
  return d.scheduled_at && Date.parse(d.scheduled_at) > now.getTime() ? "upcoming" : "due";
}

export function alertText(a: MedAlert): string {
  const left = a.days_left !== null ? Math.max(0, Math.round(a.days_left)) : null;
  switch (a.kind) {
    case "refill_soon":
      return `${a.medication_name}: about ${left} ${left === 1 ? "day" : "days"} of supply left.`;
    case "out_of_stock":
      return `${a.medication_name}: no usable supply recorded.`;
    case "expiring_soon":
      return `${a.medication_name}${a.lot_number ? ` (lot ${a.lot_number})` : ""} expires on ${a.expiry_date}.`;
    case "expired":
      return `${a.medication_name}${a.lot_number ? ` (lot ${a.lot_number})` : ""} expired on ${a.expiry_date}.`;
  }
}

export const ALERT_TONE: Record<AlertKind, "warning" | "danger"> = {
  refill_soon: "warning",
  out_of_stock: "danger",
  expiring_soon: "warning",
  expired: "danger",
};

export function medicationTitle(m: Pick<Medication, "display_name" | "strength_text">): string {
  return m.strength_text ? `${m.display_name} ${m.strength_text}` : m.display_name;
}

export const BASIS_LABEL = { prescribed: "Prescribed", self_reported: "Self-reported" } as const;
