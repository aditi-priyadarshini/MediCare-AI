/**
 * Sharing (Phase 8): types and small pure helpers.
 *
 * Wording rules these helpers enforce: a share is "shared with a named person", never "sent to the
 * doctor"; lab flags say "above/below report range", never "abnormal"; a link is shown once; the
 * recipient's link keeps its secret in the URL fragment so it is never sent to any server.
 */
import type { VerificationStatus } from "./types";

export type ShareCategory = "profile" | "conditions" | "allergies" | "medications" | "labs" | "records";
export type ShareStatus = "active" | "expired" | "revoked";
export type ShareEvent = "code_sent" | "code_failed" | "verified" | "viewed" | "blocked_revoked" | "blocked_expired";

export const CATEGORIES: Array<{ id: ShareCategory; label: string; description: string }> = [
  { id: "profile", label: "Name, date of birth and blood group", description: "From your health profile." },
  { id: "conditions", label: "Conditions", description: "Active conditions only." },
  { id: "allergies", label: "Allergies", description: "Active allergies only." },
  { id: "medications", label: "Medicines", description: "Active and paused medicines, with the dose as you wrote it." },
  { id: "labs", label: "Lab results", description: "Values, units and the range printed on each report." },
  { id: "records", label: "Record list", description: "Titles, dates and providers. The documents themselves are never shared." },
];

export const EXPIRY_OPTIONS = [
  { hours: 1, label: "1 hour" },
  { hours: 24, label: "1 day" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "7 days" },
  { hours: 720, label: "30 days" },
] as const;

export interface Share {
  id: string;
  recipient_name: string;
  recipient_email: string;
  categories: ShareCategory[];
  date_from: string | null;
  date_to: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  last_accessed_at: string | null;
  access_count: number;
  notified_at: string | null;
  status: ShareStatus;
}

export interface ShareCreated {
  share: Share;
  link: string;
  notification_sent: boolean;
}

export interface AccessLogEntry {
  id: string;
  event: ShareEvent;
  created_at: string;
}

export interface SummaryLab {
  test_name: string;
  value_numeric: number | null;
  value_text: string | null;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  flag: "low" | "normal" | "high" | "unknown";
  observed_on: string;
  verification_status: VerificationStatus;
}

export interface SharedSummary {
  generated_at: string;
  categories: ShareCategory[];
  date_from: string | null;
  date_to: string | null;
  profile: {
    display_name: string;
    date_of_birth: string | null;
    blood_group: string | null;
    blood_group_verification_status: VerificationStatus;
  } | null;
  conditions: Array<{ display_name: string; status: string; onset_date: string | null; verification_status: VerificationStatus }> | null;
  allergies: Array<{ substance: string; reaction: string | null; severity: string | null; verification_status: VerificationStatus }> | null;
  medications: Array<{
    display_name: string;
    strength_text: string | null;
    form: string | null;
    dose_text: string | null;
    instructions: string | null;
    as_needed: boolean;
    basis: "prescribed" | "self_reported";
    status: string;
    start_date: string | null;
    end_date: string | null;
    verification_status: VerificationStatus;
  }> | null;
  labs: SummaryLab[] | null;
  records: Array<{
    title: string;
    record_type: string;
    record_date: string | null;
    provider_name: string | null;
    verification_status: VerificationStatus;
    has_file: boolean;
  }> | null;
  limitations: string[];
}

export interface SharedView {
  shared_by: string;
  recipient_name: string;
  expires_at: string;
  summary: SharedSummary;
}

export const STATUS_LABEL: Record<ShareStatus, string> = {
  active: "Active",
  expired: "Expired",
  revoked: "Withdrawn",
};

export const EVENT_LABEL: Record<ShareEvent, string> = {
  code_sent: "A code was emailed to the recipient",
  code_failed: "A wrong code was entered",
  verified: "The recipient entered the code correctly",
  viewed: "The shared summary was opened",
  blocked_revoked: "Someone tried to open it after you withdrew it",
  blocked_expired: "Someone tried to open it after it expired",
};

export function categoryLabel(id: ShareCategory): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

/** "Lab flag" wording: a comparison with the report's own range, never a verdict. */
export function flagText(flag: SummaryLab["flag"]): string {
  switch (flag) {
    case "low":
      return "Below report range";
    case "high":
      return "Above report range";
    case "normal":
      return "Within report range";
    default:
      return "No range on the report";
  }
}

/** Value with unit, as entered. */
export function labValue(l: Pick<SummaryLab, "value_numeric" | "value_text" | "unit">): string {
  const v = l.value_numeric !== null ? String(l.value_numeric) : (l.value_text ?? "");
  return l.unit ? `${v} ${l.unit}` : v;
}

/** The date window in words, or null when the selection is not date-limited. */
export function rangeText(from: string | null, to: string | null): string | null {
  if (from && to) return `Dated ${from} to ${to}`;
  if (from) return `Dated from ${from}`;
  if (to) return `Dated up to ${to}`;
  return null;
}

/** Plain-language time left, or "Ended" once it is past. */
export function timeLeft(expiresAt: string, now: Date = new Date()): string {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (ms <= 0) return "Ended";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes} min left`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h left`;
  return `${Math.floor(hours / 24)} days left`;
}

/** A selection fingerprint: a preview is only valid for the exact selection it was made for. */
export function scopeKey(categories: ShareCategory[], from: string, to: string): string {
  return JSON.stringify([[...categories].sort(), from, to]);
}

const TOKEN = /^[A-Za-z0-9_-]{20,200}$/;

/** The link secret from `#<token>`, or null when the fragment is missing or malformed. */
export function tokenFromHash(hash: string): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  return TOKEN.test(raw) ? raw : null;
}

export const isSixDigits = (code: string) => /^\d{6}$/.test(code.trim());
