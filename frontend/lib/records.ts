import type { LabFlag, LabResult, RecordType } from "./types";

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
