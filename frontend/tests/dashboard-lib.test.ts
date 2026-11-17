import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  doseCounts,
  firstName,
  latestLabsByTest,
  missingProfileItems,
  todaysDoses,
  trendCandidate,
  upcomingRequests,
} from "@/lib/dashboard";
import type { Appointment } from "@/lib/care";
import type { Dose, HealthRecord, LabResult } from "@/lib/types";

const TZ = "Asia/Kolkata";
const NOW = new Date("2026-11-17T06:00:00Z"); // 11:30 on 17 Nov in India

const dose = (o: Partial<Dose> = {}): Dose => ({
  id: "d", medication_id: "m", schedule_id: "s", scheduled_at: "2026-11-17T04:00:00Z", status: "pending", taken_at: null,
  note: null, supply_id: null, units_used: null, overdue: false, medication_name: "Metformin", dose_text: "500 mg", ...o,
});
const lab = (o: Partial<LabResult> = {}): LabResult => ({
  id: "l", record_id: null, test_name: "HbA1c", value_numeric: 6.1, value_text: null, unit: "%", ref_low: 4, ref_high: 5.6,
  flag: "high", observed_on: "2026-11-01", notes: null, status: "active", verification_status: "patient_reported", ...o,
});
const rec = (o: Partial<HealthRecord> = {}): HealthRecord => ({
  id: "r", record_type: "prescription", title: "Prescription", record_date: "2026-11-10", provider_name: null, notes: null,
  status: "active", verification_status: "patient_reported", has_file: false, file_name: null, file_content_type: null,
  file_size: null, created_at: "2026-11-11T10:00:00Z", ...o,
});

describe("profile completion", () => {
  const empty = { date_of_birth: null, height_cm: null, weight_kg: null, blood_group: null };
  it("lists what is empty", () => {
    expect(missingProfileItems(empty, 0)).toEqual(["dob", "body", "blood", "contact"]);
    expect(missingProfileItems({ date_of_birth: "1990-01-01", height_cm: 170, weight_kg: 60, blood_group: "O+" }, 1)).toEqual([]);
  });
  it("needs both height and weight", () => {
    expect(missingProfileItems({ ...empty, height_cm: 170 }, 1)).toContain("body");
  });
  it("does not guess the contact item when the count is unknown", () => {
    expect(missingProfileItems(empty, null)).not.toContain("contact");
  });
  it("takes the first word of the name", () => {
    expect(firstName("  Asha  Devi ")).toBe("Asha");
  });
});

describe("todaysDoses", () => {
  it("keeps today's scheduled doses in time order and drops extras", () => {
    const list = [
      dose({ id: "late", scheduled_at: "2026-11-17T12:00:00Z" }),
      dose({ id: "early", scheduled_at: "2026-11-17T02:30:00Z" }),
      dose({ id: "tomorrow", scheduled_at: "2026-11-18T04:00:00Z" }),
      dose({ id: "extra", scheduled_at: null, status: "taken", taken_at: "2026-11-17T05:00:00Z" }),
    ];
    expect(todaysDoses(list, TZ, NOW).map((d) => d.id)).toEqual(["early", "late"]);
  });
  it("uses the person's time zone for the day boundary", () => {
    // 20:00 UTC on the 16th is 01:30 on the 17th in India.
    expect(todaysDoses([dose({ id: "x", scheduled_at: "2026-11-16T20:00:00Z" })], TZ, NOW)).toHaveLength(1);
    expect(todaysDoses([dose({ id: "x", scheduled_at: "2026-11-16T20:00:00Z" })], "UTC", NOW)).toHaveLength(0);
  });
  it("includes earlier doses that are still waiting and overdue", () => {
    const list = [
      dose({ id: "old", scheduled_at: "2026-11-16T04:00:00Z", overdue: true }),
      dose({ id: "oldTaken", scheduled_at: "2026-11-16T04:00:00Z", status: "taken" }),
    ];
    expect(todaysDoses(list, TZ, NOW).map((d) => d.id)).toEqual(["old"]);
  });
  it("counts only waiting doses", () => {
    const t = [dose({ id: "a" }), dose({ id: "b", overdue: true }), dose({ id: "c", status: "taken" }), dose({ id: "d", status: "skipped" })];
    expect(doseCounts(t)).toEqual({ waiting: 2, overdue: 1 });
  });
});

describe("buildTimeline", () => {
  it("merges records, labs and recorded dose events newest first", () => {
    const items = buildTimeline(
      [rec({ id: "r1", record_date: "2026-11-10" })],
      [lab({ id: "l1", observed_on: "2026-11-12" })],
      [dose({ id: "d1", status: "taken", taken_at: "2026-11-15T05:00:00Z" })],
    );
    expect(items.map((i) => i.id)).toEqual(["d-d1", "l-l1", "r-r1"]);
  });
  it("leaves out pending doses and entries marked as entered in error", () => {
    const items = buildTimeline(
      [rec({ id: "bad", status: "entered_in_error" })],
      [lab({ id: "bad", status: "entered_in_error" })],
      [dose({ id: "p", status: "pending" })],
    );
    expect(items).toEqual([]);
  });
  it("falls back to upload time when a record has no date, and honours the limit", () => {
    const items = buildTimeline([rec({ id: "a", record_date: null, created_at: "2026-11-16T00:00:00Z" })], [lab(), lab({ id: "l2" })], [], 2);
    expect(items).toHaveLength(2);
    expect(items[0]!.id).toBe("r-a");
  });
  it("shows skipped doses by their scheduled time", () => {
    const [item] = buildTimeline([], [], [dose({ id: "s", status: "skipped", scheduled_at: "2026-11-14T04:00:00Z" })]);
    expect(item!.kind).toBe("dose");
    expect(item!.when).toBe(Date.parse("2026-11-14T04:00:00Z"));
  });
});

describe("labs", () => {
  it("returns the newest result per test", () => {
    const out = latestLabsByTest([
      lab({ id: "old", observed_on: "2026-01-01" }),
      lab({ id: "new", observed_on: "2026-10-01" }),
      lab({ id: "b", test_name: "LDL", observed_on: "2026-09-01" }),
    ]);
    expect(out.map((l) => l.id)).toEqual(["new", "b"]);
  });
  it("limits and ignores entries marked as errors", () => {
    const many = ["A", "B", "C", "D", "E"].map((n, i) => lab({ id: n, test_name: n, observed_on: `2026-10-0${i + 1}` }));
    expect(latestLabsByTest(many, 3)).toHaveLength(3);
    expect(latestLabsByTest([lab({ status: "entered_in_error" })])).toEqual([]);
  });
  it("offers a trend only for a test with two or more numeric results in one unit", () => {
    expect(trendCandidate([lab()])).toBeNull();
    expect(trendCandidate([lab({ id: "1" }), lab({ id: "2", unit: "mmol/mol" })])).toBeNull();
    expect(trendCandidate([lab({ id: "1" }), lab({ id: "2", value_numeric: null, value_text: "Positive" })])).toBeNull();
    expect(trendCandidate([lab({ id: "1" }), lab({ id: "2", observed_on: "2026-06-01" })])).toBe("HbA1c");
  });
});

describe("upcomingRequests", () => {
  const appt = (o: Partial<Appointment> = {}): Appointment => ({
    id: "a", doctor: { id: "d", display_name: "Dr Amy", clinic_name: null, phone: null, city: "X" }, preferred_date: "2026-11-20",
    preferred_window: "any", reason: null, mode: "request_only", status: "request_only", status_text: "", provider_reference: null,
    provider_responded_at: null, provider_message: null, created_at: "2026-11-01T00:00:00Z", ...o,
  });
  it("keeps open, future requests soonest first", () => {
    const out = upcomingRequests(
      [
        appt({ id: "later", preferred_date: "2026-12-01" }),
        appt({ id: "soon", preferred_date: "2026-11-18" }),
        appt({ id: "past", preferred_date: "2026-11-01" }),
        appt({ id: "cancelled", status: "cancelled" }),
        appt({ id: "declined", status: "declined" }),
      ],
      "2026-11-17",
    );
    expect(out.map((a) => a.id)).toEqual(["soon", "later"]);
  });
});
