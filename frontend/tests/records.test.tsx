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
