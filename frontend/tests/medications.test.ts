import { describe, expect, it } from "vitest";
import {
  alertText,
  dayKey,
  dayLabel,
  doseState,
  formatClock,
  formatInstant,
  groupDosesByDay,
  normaliseTimes,
  scheduleSummary,
} from "@/lib/medications";
import type { Dose, MedAlert } from "@/lib/types";

const dose = (over: Partial<Dose>): Dose => ({
  id: "d",
  medication_id: "m",
  schedule_id: "s",
  scheduled_at: "2026-11-15T02:30:00Z",
  status: "pending",
  taken_at: null,
  note: null,
  supply_id: null,
  units_used: null,
  overdue: false,
  medication_name: "Metformin",
  dose_text: "500 mg",
  ...over,
});

describe("times", () => {
  it("cleans, de-duplicates and sorts", () => {
    expect(normaliseTimes(["20:00", "08:00", " 08:00 ", ""])).toEqual({ times: ["08:00", "20:00"], error: null });
  });
  it("rejects empty and malformed input", () => {
    expect(normaliseTimes([]).error).toMatch(/at least one/i);
    expect(normaliseTimes(["", " "]).error).toMatch(/at least one/i);
    expect(normaliseTimes(["8:00"]).error).toMatch(/hours and minutes/i);
    expect(normaliseTimes(["24:00"]).error).toMatch(/hours and minutes/i);
  });
  it("formats a 24-hour clock for people", () => {
    expect(formatClock("00:05")).toBe("12:05 am");
    expect(formatClock("12:00")).toBe("12:00 pm");
    expect(formatClock("20:30")).toBe("8:30 pm");
  });
});

describe("scheduleSummary", () => {
  it("describes daily, interval and weekday schedules", () => {
    expect(scheduleSummary({ times: ["08:00", "20:00"], days_of_week: null, every_n_days: 1 })).toBe(
      "8:00 am, 8:00 pm · every day",
    );
    expect(scheduleSummary({ times: ["09:00"], days_of_week: null, every_n_days: 2 })).toBe("9:00 am · every 2 days");
    expect(scheduleSummary({ times: ["09:00"], days_of_week: [0, 3], every_n_days: 1 })).toBe("9:00 am · Mon, Thu");
    expect(scheduleSummary({ times: ["09:00"], days_of_week: [0, 1, 2, 3, 4, 5, 6], every_n_days: 1 })).toBe(
      "9:00 am · every day",
    );
  });
});

describe("time zones", () => {
  it("shows an instant in the patient's zone", () => {
    expect(formatInstant("2026-11-15T02:30:00Z", "Asia/Kolkata")).toMatch(/^8:00\s?am$/i);
  });
  it("keys days by the zone's calendar, not UTC", () => {
    // 20:00 UTC on the 14th is already 01:30 on the 15th in India.
    expect(dayKey("2026-11-14T20:00:00Z", "Asia/Kolkata")).toBe("2026-11-15");
    expect(dayKey("2026-11-14T20:00:00Z", "UTC")).toBe("2026-11-14");
  });
  it("labels today, tomorrow and yesterday in that zone", () => {
    const now = new Date("2026-11-14T20:00:00Z"); // 15 Nov in Kolkata
    expect(dayLabel("2026-11-15", now, "Asia/Kolkata")).toBe("Today");
    expect(dayLabel("2026-11-16", now, "Asia/Kolkata")).toBe("Tomorrow");
    expect(dayLabel("2026-11-14", now, "Asia/Kolkata")).toBe("Yesterday");
    expect(dayLabel("2026-11-20", now, "Asia/Kolkata")).toMatch(/20/);
  });
  it("groups doses by local day, oldest first, placing extra doses by when they were taken", () => {
    const groups = groupDosesByDay(
      [
        dose({ id: "late", scheduled_at: "2026-11-15T16:00:00Z" }),
        dose({ id: "extra", scheduled_at: null, taken_at: "2026-11-14T20:30:00Z", status: "taken" }),
        dose({ id: "early", scheduled_at: "2026-11-14T02:30:00Z" }),
      ],
      "Asia/Kolkata",
    );
    expect(groups.map((g) => g.key)).toEqual(["2026-11-14", "2026-11-15"]);
    expect(groups[0]!.doses.map((d) => d.id)).toEqual(["early"]);
    expect(groups[1]!.doses.map((d) => d.id)).toEqual(["extra", "late"]);
  });
});

describe("doseState", () => {
  const now = new Date("2026-11-15T03:00:00Z");
  it("only reports taken when the server says taken", () => {
    expect(doseState(dose({ status: "pending", scheduled_at: "2026-11-15T02:30:00Z" }), now)).toBe("due");
    expect(doseState(dose({ status: "taken", taken_at: "2026-11-15T02:35:00Z" }), now)).toBe("taken");
  });
  it("distinguishes overdue, upcoming and skipped", () => {
    expect(doseState(dose({ overdue: true }), now)).toBe("overdue");
    expect(doseState(dose({ scheduled_at: "2026-11-15T10:00:00Z" }), now)).toBe("upcoming");
    expect(doseState(dose({ status: "skipped" }), now)).toBe("skipped");
  });
});

describe("alertText", () => {
  const base: MedAlert = {
    kind: "refill_soon",
    medication_id: "m",
    medication_name: "Metformin",
    supply_id: null,
    lot_number: null,
    expiry_date: null,
    days_left: 5,
    remaining: 10,
  };
  it("describes each kind", () => {
    expect(alertText(base)).toBe("Metformin: about 5 days of supply left.");
    expect(alertText({ ...base, days_left: 1 })).toBe("Metformin: about 1 day of supply left.");
    expect(alertText({ ...base, kind: "out_of_stock" })).toMatch(/no usable supply/);
    expect(alertText({ ...base, kind: "expiring_soon", expiry_date: "2026-12-01", lot_number: "B7" })).toBe(
      "Metformin (lot B7) expires on 2026-12-01.",
    );
    expect(alertText({ ...base, kind: "expired", expiry_date: "2026-10-01" })).toBe(
      "Metformin expired on 2026-10-01.",
    );
  });
});

import { alertsFor, defaultScheduleDraft, medsForTab, nextPendingDose, scheduleDraftToBody, ALERT_TONE } from "@/lib/medications";

describe("medication list helpers", () => {
  it("maps tabs to statuses and never lists entries removed in error", () => {
    const m = [{ status: "active" }, { status: "paused" }, { status: "stopped" }, { status: "entered_in_error" }] as Array<{ status: "active" | "paused" | "stopped" | "entered_in_error" }>;
    expect(medsForTab(m, "active")).toHaveLength(1);
    expect(medsForTab(m, "completed")[0]!.status).toBe("stopped");
    expect(medsForTab(m, "paused")).toHaveLength(1);
  });
  it("finds the earliest waiting dose of one medicine, overdue first by time", () => {
    const ds = [
      dose({ id: "late", scheduled_at: "2026-11-15T10:00:00Z" }),
      dose({ id: "early", scheduled_at: "2026-11-15T02:00:00Z", overdue: true }),
      dose({ id: "done", scheduled_at: "2026-11-15T01:00:00Z", status: "taken" }),
      dose({ id: "other", medication_id: "x", scheduled_at: "2026-11-15T00:00:00Z" }),
    ];
    expect(nextPendingDose(ds, "m")!.id).toBe("early");
    expect(nextPendingDose([], "m")).toBeNull();
  });
  it("filters alerts per medicine; out of stock is caution, expired is danger", () => {
    const a = [{ medication_id: "m" }, { medication_id: "n" }] as MedAlert[];
    expect(alertsFor(a, "m")).toHaveLength(1);
    expect(ALERT_TONE.out_of_stock).toBe("warning");
    expect(ALERT_TONE.expired).toBe("danger");
  });
});

describe("scheduleDraftToBody", () => {
  const base = defaultScheduleDraft("2026-11-17");
  it("accepts a daily schedule", () => {
    expect(scheduleDraftToBody(base).body).toMatchObject({ times: ["08:00"], days_of_week: null, every_n_days: 1 });
  });
  it("reports problems and returns no body", () => {
    expect(scheduleDraftToBody({ ...base, repeat: "weekdays" }).errors.days).toBeTruthy();
    expect(scheduleDraftToBody({ ...base, repeat: "interval", every: "1" }).errors.every).toBeTruthy();
    expect(scheduleDraftToBody({ ...base, end: "2026-01-01" }).errors.end).toBeTruthy();
    expect(scheduleDraftToBody({ ...base, times: [""] }).body).toBeNull();
  });
});
