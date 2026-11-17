import type { LabFlag, LabResult, LabTrend, RecordType } from "./types";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg"];

export const RECORD_TYPES: Array<{ value: RecordType; label: string }> = [
  { value: "lab_report", label: "Lab report" },
  { value: "prescription", label: "Prescription" },
  { value: "imaging", label: "Imaging (X-ray, scan)" },
  { value: "discharge_summary", label: "Discharge summary" },
  { value: "vaccination", label: "Vaccination" },
  { value: "other", label: "Other" },
];

export const recordTypeLabel = (t: RecordType) => RECORD_TYPES.find((r) => r.value === t)?.label ?? t;

/** The flag compares a value to the range printed on the report. It is not a diagnosis. */
export const FLAG_LABEL: Record<LabFlag, string> = {
  low: "Below report range",
  normal: "Within report range",
  high: "Above report range",
  unknown: "No range on report",
};

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Client-side pre-check for a friendlier message; the server is the authority. */
export function checkUpload(file: { size: number; type: string }): string | null {
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_UPLOAD_BYTES) return `Files can be up to ${formatBytes(MAX_UPLOAD_BYTES)}.`;
  if (file.type && !ACCEPTED_TYPES.includes(file.type)) return "Choose a PDF, PNG or JPEG file.";
  return null;
}

/** Empty -> null; otherwise a finite number or NaN. */
export function parseNumber(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export function formatLabValue(l: Pick<LabResult, "value_numeric" | "value_text" | "unit">): string {
  const v = l.value_numeric !== null ? String(l.value_numeric) : (l.value_text ?? "–");
  return l.unit && l.value_numeric !== null ? `${v} ${l.unit}` : v;
}

export function formatRange(low: number | null, high: number | null, unit?: string | null): string | null {
  if (low === null && high === null) return null;
  const u = unit ? ` ${unit}` : "";
  if (low !== null && high !== null) return `${low}–${high}${u}`;
  return low !== null ? `≥ ${low}${u}` : `≤ ${high}${u}`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "Date not set";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export interface ChartGeometry {
  line: string;
  dots: Array<{ x: number; y: number; id: string }>;
  band: { y: number; height: number } | null;
}

/** Pure scaling so it can be tested without a DOM. Points are oldest-first. */
export function chartGeometry(
  points: Array<{ id: string; observed_on: string; value: number }>,
  refLow: number | null,
  refHigh: number | null,
  width: number,
  height: number,
  pad = 24,
): ChartGeometry {
  const values = points.map((p) => p.value);
  const candidates = [...values, ...(refLow !== null ? [refLow] : []), ...(refHigh !== null ? [refHigh] : [])];
  let min = Math.min(...candidates);
  let max = Math.max(...candidates);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - 2 * pad);
  const times = points.map((p) => Date.parse(p.observed_on));
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const x = (t: number) => (t1 === t0 ? width / 2 : pad + ((t - t0) / (t1 - t0)) * (width - 2 * pad));
  const dots = points.map((p, i) => ({ x: x(times[i]!), y: y(p.value), id: p.id }));
  const top = refHigh !== null ? y(refHigh) : pad;
  const bottom = refLow !== null ? y(refLow) : height - pad;
  const band = refLow !== null || refHigh !== null ? { y: top, height: Math.max(0, bottom - top) } : null;
  return { line: dots.map((d, i) => `${i ? "L" : "M"}${d.x.toFixed(1)},${d.y.toFixed(1)}`).join(" "), dots, band };
}

/* ------------------------------------------------------------------ records list filtering */
export interface RecordFilter {
  query: string;
  /** Inclusive ISO dates (YYYY-MM-DD); empty string = no limit. */
  from: string;
  to: string;
}

/**
 * Narrows the records already loaded: text match on title, provider, notes and type, and an
 * inclusive date range. A record with no date is kept only when no date range is set, because it
 * cannot be placed inside one.
 */
export function filterRecords<
  T extends { title: string; provider_name: string | null; notes: string | null; record_type: RecordType; record_date: string | null },
>(items: T[], f: RecordFilter): T[] {
  const q = f.query.trim().toLowerCase();
  const ranged = Boolean(f.from || f.to);
  return items.filter((r) => {
    if (q) {
      const hay = [r.title, r.provider_name ?? "", r.notes ?? "", recordTypeLabel(r.record_type)].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (ranged) {
      if (!r.record_date) return false;
      if (f.from && r.record_date < f.from) return false;
      if (f.to && r.record_date > f.to) return false;
    }
    return true;
  });
}

/** Said before any edit or file replacement is saved: the server resets verification either way. */
export const EDIT_RESETS_NOTICE =
  "Saving a change marks this record as “Patient reported”, even if it was confirmed before. The original confirmation is not kept on the edited version.";
export const REPLACE_RESETS_NOTICE = "Attaching a new file marks this record as “Patient reported”.";

export const UPLOAD_HELP = "PDF, PNG or JPEG, up to 10 MB. The file type is checked again on the server.";

/* ------------------------------------------------------------------ lab results */
export const NO_COMPARABLE_HISTORY = "No comparable history yet.";

/** Units compare equal ignoring case and surrounding spaces; a missing unit is its own group. */
export const normUnit = (u: string | null | undefined) => (u ?? "").trim().toLowerCase();

/**
 * `/labs/trend` returns every numeric result of a test name and takes the unit and range from the
 * newest one; it does not separate units. This keeps only the points whose own result has the same
 * unit as the newest, so results in different units are never drawn on one axis. A point whose
 * result is not among `results` cannot be checked and is left out.
 * `excluded` is how many points were dropped, so the page can say so.
 */
export function comparableTrend(
  trend: LabTrend,
  results: Array<Pick<LabResult, "id" | "unit">>,
): { trend: LabTrend; excluded: number } {
  const unitById = new Map(results.map((r) => [r.id, normUnit(r.unit)]));
  const wanted = normUnit(trend.unit);
  const points = trend.points.filter((p) => unitById.get(p.id) === wanted);
  return { trend: { ...trend, points }, excluded: trend.points.length - points.length };
}

export interface LabForm {
  test_name: string;
  result: string;
  unit: string;
  ref_low: string;
  ref_high: string;
  observed_on: string;
}

export const emptyLabForm = (): LabForm => ({ test_name: "", result: "", unit: "", ref_low: "", ref_high: "", observed_on: todayISO() });

export function labFormFrom(l: LabResult): LabForm {
  return {
    test_name: l.test_name,
    result: l.value_numeric !== null ? String(l.value_numeric) : (l.value_text ?? ""),
    unit: l.unit ?? "",
    ref_low: l.ref_low !== null ? String(l.ref_low) : "",
    ref_high: l.ref_high !== null ? String(l.ref_high) : "",
    observed_on: l.observed_on,
  };
}

/** Field-level problems, keyed by form field. Empty object = valid. */
export function labFormProblems(f: LabForm): Record<string, string> {
  const e: Record<string, string> = {};
  const low = parseNumber(f.ref_low);
  const high = parseNumber(f.ref_high);
  if (!f.test_name.trim()) e.test_name = "Enter the test name.";
  if (!f.result.trim()) e.result = "Enter the result.";
  if (Number.isNaN(low)) e.ref_low = "Enter a number.";
  if (Number.isNaN(high)) e.ref_high = "Enter a number.";
  if (low !== null && high !== null && !Number.isNaN(low) && !Number.isNaN(high) && low > high) e.ref_low = "Low can’t be above high.";
  if (!f.observed_on) e.observed_on = "Choose the test date.";
  return e;
}

/** API body. A number is stored as a number (so it can be charted); anything else as text. */
export function labBody(f: LabForm) {
  const numeric = parseNumber(f.result);
  const isNumber = numeric !== null && !Number.isNaN(numeric);
  const low = parseNumber(f.ref_low);
  const high = parseNumber(f.ref_high);
  return {
    test_name: f.test_name.trim(),
    value_numeric: isNumber ? numeric : null,
    value_text: isNumber ? null : f.result.trim(),
    unit: f.unit.trim() || null,
    ref_low: isNumber && low !== null && !Number.isNaN(low) ? low : null,
    ref_high: isNumber && high !== null && !Number.isNaN(high) ? high : null,
    observed_on: f.observed_on,
  };
}

export const LAB_EDIT_RESETS_NOTICE =
  "Saving a change marks this result as “Patient reported” again, even if it was confirmed before.";

/** Fields each Easy-read step asks for, so a step can be checked before moving on. */
export const LAB_STEP_FIELDS: Array<Array<keyof LabForm>> = [["test_name"], ["result", "unit"], ["ref_low", "ref_high", "observed_on"]];
