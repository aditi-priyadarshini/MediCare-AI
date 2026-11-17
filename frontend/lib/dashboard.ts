/**
 * Pure helpers behind the dashboard. Everything here reshapes data the API already returned;
 * nothing is estimated, scored or invented (master spec §3).
 */
import type { Appointment } from "./care";
import { dayKey, doseWhen } from "./medications";
import type { Dose, HealthRecord, LabResult, Profile } from "./types";

/* ------------------------------------------------------------------ profile completion */
export type MissingKey = "dob" | "body" | "blood" | "contact";

/**
 * What is still empty on the profile. `contactCount` is null when the contacts call failed: then the
 * contact item is left out rather than guessed.
 */
export function missingProfileItems(
  p: Pick<Profile, "date_of_birth" | "height_cm" | "weight_kg" | "blood_group">,
  contactCount: number | null,
): MissingKey[] {
  const out: MissingKey[] = [];
  if (p.date_of_birth === null) out.push("dob");
  if (p.height_cm === null || p.weight_kg === null) out.push("body");
  if (p.blood_group === null) out.push("blood");
  if (contactCount !== null && contactCount === 0) out.push("contact");
  return out;
}

export const firstName = (displayName: string) => displayName.trim().split(/\s+/)[0] ?? "";

/* ------------------------------------------------------------------ doses */
/**
 * Doses for the "Today" tile: everything scheduled on today's calendar day in the person's time zone,
 * plus earlier doses still waiting and marked overdue. Extra (unscheduled) doses are not "today's plan".
 */
export function todaysDoses(doses: Dose[], timeZone: string, now: Date): Dose[] {
  const today = dayKey(now, timeZone);
  return doses
    .filter((d) => {
      if (d.scheduled_at === null) return false;
      if (dayKey(d.scheduled_at, timeZone) === today) return true;
      return d.status === "pending" && d.overdue;
    })
    .sort((a, b) => Date.parse(a.scheduled_at!) - Date.parse(b.scheduled_at!));
}

export interface DoseCounts {
  waiting: number;
  overdue: number;
}

export function doseCounts(today: Dose[]): DoseCounts {
  const waiting = today.filter((d) => d.status === "pending");
  return { waiting: waiting.length, overdue: waiting.filter((d) => d.overdue).length };
}

/* ------------------------------------------------------------------ timeline */
export type TimelineItem =
  | { kind: "record"; id: string; when: number; record: HealthRecord }
  | { kind: "lab"; id: string; when: number; lab: LabResult }
  | { kind: "dose"; id: string; when: number; dose: Dose };

const ms = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

/**
 * Newest first. Uses only what the API returned: records (document date, else upload time), lab
 * results (date observed) and dose events the person actually recorded (taken or skipped).
 * Entries marked "entered in error" are left out.
 */
export function buildTimeline(
  records: HealthRecord[],
  labs: LabResult[],
  doses: Dose[],
  limit = 8,
): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const r of records) {
    if (r.status !== "active") continue;
    items.push({ kind: "record", id: `r-${r.id}`, when: ms(r.record_date ?? r.created_at), record: r });
  }
  for (const l of labs) {
    if (l.status !== "active") continue;
    items.push({ kind: "lab", id: `l-${l.id}`, when: ms(l.observed_on), lab: l });
  }
  for (const d of doses) {
    if (d.status === "pending") continue;
    const at = d.status === "taken" ? (d.taken_at ?? doseWhen(d)) : doseWhen(d);
    items.push({ kind: "dose", id: `d-${d.id}`, when: ms(at), dose: d });
  }
  return items.sort((a, b) => b.when - a.when).slice(0, limit);
}

/* ------------------------------------------------------------------ labs */
/** The newest active result of each test, newest first. */
export function latestLabsByTest(labs: LabResult[], limit = 4): LabResult[] {
  const seen = new Set<string>();
  const out: LabResult[] = [];
  const sorted = labs.filter((l) => l.status === "active").sort((a, b) => ms(b.observed_on) - ms(a.observed_on));
  for (const l of sorted) {
    const key = l.test_name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * A test that can honestly be drawn as a trend: at least two numeric results in the same unit.
 * Returns the test with the most such results (ties: the most recent). Null when none qualifies.
 */
export function trendCandidate(labs: LabResult[]): string | null {
  const groups = new Map<string, { name: string; n: number; latest: number }>();
  for (const l of labs) {
    if (l.status !== "active" || l.value_numeric === null) continue;
    const key = `${l.test_name.trim().toLowerCase()}|${(l.unit ?? "").trim().toLowerCase()}`;
    const g = groups.get(key) ?? { name: l.test_name, n: 0, latest: 0 };
    g.n += 1;
    g.latest = Math.max(g.latest, ms(l.observed_on));
    groups.set(key, g);
  }
  const best = [...groups.values()]
    .filter((g) => g.n >= 2)
    .sort((a, b) => b.n - a.n || b.latest - a.latest)[0];
  return best?.name ?? null;
}

/* ------------------------------------------------------------------ appointments */
/** Requests that are still open and not in the past, soonest first. Cancelled and declined are dropped. */
export function upcomingRequests(items: Appointment[], todayISO: string, limit = 3): Appointment[] {
  return items
    .filter((a) => a.status !== "cancelled" && a.status !== "declined" && a.preferred_date >= todayISO)
    .sort((a, b) => a.preferred_date.localeCompare(b.preferred_date))
    .slice(0, limit);
}
