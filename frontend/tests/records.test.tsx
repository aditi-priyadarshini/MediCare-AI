import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrendChart } from "@/components/records/TrendChart";
import {
  chartGeometry,
  checkUpload,
  formatBytes,
  formatLabValue,
  formatRange,
  MAX_UPLOAD_BYTES,
  parseNumber,
} from "@/lib/records";
import type { LabTrend } from "@/lib/types";

describe("checkUpload", () => {
  it("accepts PDF, PNG and JPEG within the size limit", () => {
    for (const type of ["application/pdf", "image/png", "image/jpeg"]) {
      expect(checkUpload({ size: 1000, type })).toBeNull();
    }
  });
  it("rejects empty, oversize and unsupported files", () => {
    expect(checkUpload({ size: 0, type: "application/pdf" })).toMatch(/empty/i);
    expect(checkUpload({ size: MAX_UPLOAD_BYTES + 1, type: "application/pdf" })).toMatch(/up to/i);
    expect(checkUpload({ size: 10, type: "text/html" })).toMatch(/PDF, PNG or JPEG/);
  });
});

describe("formatting", () => {
  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
  it("parses numbers strictly", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber(" 12.5 ")).toBe(12.5);
    expect(parseNumber("abc")).toBeNaN();
    expect(parseNumber("Infinity")).toBeNaN();
  });
  it("formats values and ranges", () => {
    expect(formatLabValue({ value_numeric: 11.2, value_text: null, unit: "g/dL" })).toBe("11.2 g/dL");
    expect(formatLabValue({ value_numeric: null, value_text: "Negative", unit: null })).toBe("Negative");
    expect(formatRange(12, 15.5, "g/dL")).toBe("12–15.5 g/dL");
    expect(formatRange(null, 5)).toBe("≤ 5");
    expect(formatRange(2, null)).toBe("≥ 2");
    expect(formatRange(null, null)).toBeNull();
  });
});

describe("chartGeometry", () => {
  const pts = [
    { id: "a", observed_on: "2026-08-01", value: 10 },
    { id: "b", observed_on: "2026-09-01", value: 20 },
  ];
  it("scales oldest-left, higher values toward the top, within the padding", () => {
    const g = chartGeometry(pts, null, null, 500, 200, 20);
    expect(g.dots[0]!.x).toBe(20);
    expect(g.dots[1]!.x).toBe(480);
    expect(g.dots[1]!.y).toBeLessThan(g.dots[0]!.y);
    expect(g.band).toBeNull();
  });
  it("includes the reference range in the axis so the band is always visible", () => {
    const g = chartGeometry(pts, 5, 30, 500, 200, 20);
    expect(g.band!.height).toBeGreaterThan(0);
    for (const d of g.dots) {
      expect(d.y).toBeGreaterThanOrEqual(20);
      expect(d.y).toBeLessThanOrEqual(180);
    }
  });
  it("handles a single point without NaN", () => {
    const g = chartGeometry([pts[0]!], null, null, 500, 200);
    expect(Number.isFinite(g.dots[0]!.x) && Number.isFinite(g.dots[0]!.y)).toBe(true);
    expect(g.line).not.toContain("NaN");
  });
});

describe("TrendChart", () => {
  const trend: LabTrend = {
    test_name: "Hemoglobin",
    unit: "g/dL",
    ref_low: 12,
    ref_high: 15.5,
    points: [
      { id: "1", observed_on: "2026-08-01", value: 13, flag: "normal" },
      { id: "2", observed_on: "2026-11-01", value: 11.2, flag: "low" },
    ],
  };
  it("describes the data in text, not only graphically", () => {
    render(<TrendChart trend={trend} />);
    expect(screen.getByRole("img", { name: /Hemoglobin: 2 results.*Latest 11.2 g\/dL/ })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: /Hemoglobin results over time/ });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3); // header + 2, newest first
    expect(within(rows[1]!).getByText("Below report range")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Within report range")).toBeInTheDocument();
  });
  it("never uses diagnostic wording", () => {
    const { container } = render(<TrendChart trend={trend} />);
    expect(container.textContent).not.toMatch(/abnormal|healthy|disease|diagnos/i);
  });
});

import { comparableTrend, filterRecords, labBody, labFormProblems, emptyLabForm, normUnit } from "@/lib/records";

describe("filterRecords", () => {
  const rec = (o: Partial<{ title: string; provider_name: string | null; notes: string | null; record_type: "lab_report" | "prescription"; record_date: string | null }>) => ({
    title: "Blood test", provider_name: null, notes: null, record_type: "lab_report" as const, record_date: "2026-03-10", ...o,
  });
  it("matches text on title, provider, notes and type", () => {
    const items = [rec({}), rec({ title: "Scan", provider_name: "City Lab" }), rec({ title: "Rx", record_type: "prescription" })];
    expect(filterRecords(items, { query: "city", from: "", to: "" })).toHaveLength(1);
    expect(filterRecords(items, { query: "prescription", from: "", to: "" })).toHaveLength(1);
  });
  it("applies an inclusive date range and drops undated records only when a range is set", () => {
    const items = [rec({ record_date: "2026-03-10" }), rec({ record_date: "2026-04-01" }), rec({ record_date: null })];
    expect(filterRecords(items, { query: "", from: "2026-03-10", to: "2026-03-31" })).toHaveLength(1);
    expect(filterRecords(items, { query: "", from: "", to: "" })).toHaveLength(3);
  });
});

describe("comparableTrend", () => {
  const trend: LabTrend = {
    test_name: "Glucose", unit: "mg/dL", ref_low: 70, ref_high: 100,
    points: [
      { id: "a", observed_on: "2026-01-01", value: 5.2, flag: "normal" },
      { id: "b", observed_on: "2026-02-01", value: 95, flag: "normal" },
      { id: "c", observed_on: "2026-03-01", value: 110, flag: "high" },
    ],
  };
  it("keeps only points in the newest result's unit and counts the rest", () => {
    const r = comparableTrend(trend, [
      { id: "a", unit: "mmol/L" }, { id: "b", unit: " MG/DL " }, { id: "c", unit: "mg/dL" },
    ]);
    expect(r.trend.points.map((p) => p.id)).toEqual(["b", "c"]);
    expect(r.excluded).toBe(1);
  });
  it("drops points it cannot check", () => {
    expect(comparableTrend(trend, [{ id: "c", unit: "mg/dL" }]).trend.points).toHaveLength(1);
  });
  it("normalises units", () => expect(normUnit(" G/dL ")).toBe("g/dl"));
});

describe("lab form", () => {
  it("requires test, result and date; rejects low above high", () => {
    const e = labFormProblems({ ...emptyLabForm(), observed_on: "" });
    expect(Object.keys(e)).toEqual(expect.arrayContaining(["test_name", "result", "observed_on"]));
    expect(labFormProblems({ ...emptyLabForm(), test_name: "x", result: "1", ref_low: "9", ref_high: "2" }).ref_low).toMatch(/can’t be above/);
  });
  it("stores numbers as numbers and words as text without a range", () => {
    expect(labBody({ ...emptyLabForm(), test_name: "Hb", result: "11.2", ref_low: "12" })).toMatchObject({ value_numeric: 11.2, value_text: null, ref_low: 12 });
    expect(labBody({ ...emptyLabForm(), test_name: "HIV", result: "Negative", ref_low: "1" })).toMatchObject({ value_numeric: null, value_text: "Negative", ref_low: null });
  });
});
