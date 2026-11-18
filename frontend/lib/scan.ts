import { api } from "./api-client";
import { emptyLabForm, labBody, labFormProblems, todayISO, type LabForm } from "./records";
import type { RecordType } from "./types";

/* A scan is a DRAFT. Nothing in it has been saved. It only pre-fills forms; the patient checks every
   field and presses Save, and what is saved is "Patient reported" like any typed entry. */

export type ScanConfidence = "high" | "medium" | "low";

export interface ScanLabRow {
  test_name: string;
  result: string;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  confidence: ScanConfidence;
  /** The line of the report this row was read from, shown so it can be checked against the page. */
  source_line: string;
}

export interface ScanResult {
  method: "pdf_text" | "ocr" | "pdf_ocr";
  pages_read: number;
  pages_total: number;
  text_found: boolean;
  record: {
    record_type: RecordType | null;
    title: string | null;
    record_date: string | null;
    date_ambiguous: boolean;
    provider_name: string | null;
  };
  labs: ScanLabRow[];
  warnings: string[];
}

export interface ScanStatus {
  available: boolean;
  photos: boolean;
  pdf_text: boolean;
  scanned_pdf: boolean;
}

export const scanStatus = () => api<ScanStatus>("/records/scan/status");

export function scanFile(file: File): Promise<ScanResult> {
  const body = new FormData();
  body.append("file", file);
  return api<ScanResult>("/records/scan", { method: "POST", body });
}

export const SCAN_PRIVACY =
  "The picture is read on our own server and is not sent to any other service. Nothing is saved until you press Save.";

export const SCAN_CHECK_NOTICE =
  "Filled in from your report. Check every field against the original before saving; reading a picture can get a character wrong.";

/* --------------------------------------------------------------------- record form */
export interface RecordFields {
  record_type: RecordType;
  title: string;
  record_date: string;
  provider_name: string;
  notes: string;
}

/**
 * Applies a scan to the record form. Only fields the scan actually found are replaced; everything
 * else (including anything the patient already typed) stays as it was. A date in the future is
 * never applied: the form and the server both refuse one.
 */
export function applyScanToRecord(current: RecordFields, scan: ScanResult, today = todayISO()): { next: RecordFields; filled: string[] } {
  const next = { ...current };
  const filled: string[] = [];
  const r = scan.record;
  if (r.record_type) {
    next.record_type = r.record_type;
    filled.push("type");
  }
  if (r.title) {
    next.title = r.title;
    filled.push("title");
  }
  if (r.record_date && r.record_date <= today) {
    next.record_date = r.record_date;
    filled.push("date");
  }
  if (r.provider_name) {
    next.provider_name = r.provider_name;
    filled.push("doctor or lab");
  }
  return { next, filled };
}

/** "Filled in: type, title and date." for the notice shown after a scan. */
export function filledSummary(filled: string[]): string {
  if (filled.length === 0) return "";
  if (filled.length === 1) return filled[0]!;
  return `${filled.slice(0, -1).join(", ")} and ${filled[filled.length - 1]}`;
}

/* ---------------------------------------------------------------------- lab review */
export interface ReviewRow {
  /** Stable key for React; the scan order. */
  key: number;
  include: boolean;
  form: LabForm;
  confidence: ScanConfidence;
  source_line: string;
}

export const CONFIDENCE_LABEL: Record<ScanConfidence, string> = {
  high: "Value, unit and range read",
  medium: "Check this one",
  low: "Unsure, check carefully",
};

const num = (n: number | null) => (n === null ? "" : String(n));

/** One scanned row as the lab form the patient already knows. Low-confidence rows start unticked. */
export function reviewRows(scan: ScanResult, observedOn: string): ReviewRow[] {
  return scan.labs.map((l, i) => ({
    key: i,
    include: l.confidence !== "low",
    confidence: l.confidence,
    source_line: l.source_line,
    form: { ...emptyLabForm(), test_name: l.test_name, result: l.result, unit: l.unit ?? "", ref_low: num(l.ref_low), ref_high: num(l.ref_high), observed_on: observedOn },
  }));
}

/** Per-row problems for the ticked rows only, keyed by row key. Unticked rows are never checked. */
export function reviewProblems(rows: ReviewRow[], observedOn: string): Map<number, Record<string, string>> {
  const out = new Map<number, Record<string, string>>();
  for (const r of rows) {
    if (!r.include) continue;
    const p = labFormProblems({ ...r.form, observed_on: observedOn });
    if (Object.keys(p).length) out.set(r.key, p);
  }
  return out;
}

export const dateProblem = (observedOn: string, today = todayISO()): string | null =>
  !observedOn ? "Choose the test date." : observedOn > today ? "The date can’t be in the future." : null;

/** Body for POST /labs/bulk: ticked rows only, in the same shape the single-result form sends. */
export function bulkLabsBody(rows: ReviewRow[], observedOn: string, recordId: string | null) {
  return {
    record_id: recordId,
    items: rows.filter((r) => r.include).map((r) => labBody({ ...r.form, observed_on: observedOn })),
  };
}

/* ------------------------------------------------------------------------- camera */
export const cameraSupported = () => typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

/** Phones and tablets: the system camera app takes a better, focused photo than a web view can. */
export const prefersSystemCamera = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;

/** A plain-language reason for a camera failure (the browser's own names are not for patients). */
export function cameraErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera access was blocked. Allow the camera for this site in your browser settings, or upload a photo instead.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera was found on this device. You can upload a photo instead.";
    case "NotReadableError":
    case "AbortError":
      return "The camera is in use by another app. Close it and try again, or upload a photo instead.";
    default:
      return "The camera couldn’t be started. You can upload a photo instead.";
  }
}

export const photoFileName = (now = new Date()) => `scan-${now.toISOString().slice(0, 19).replace(/[:T]/g, "-")}.jpg`;
