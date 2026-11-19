import { ApiError } from "./api-client";
import { en, type MessageKey } from "./i18n/en";
import type { AssistantContext, AssistantMode, ChatMessage, ContextKey, EvidenceItem } from "./types";

/* ------------------------------------------------------------------ context switches */
export interface ContextOption {
  key: ContextKey;
  labelKey: MessageKey;
  hintKey: MessageKey;
  /** Short name used in the "Using: …" chips. */
  chipKey: MessageKey;
}

/** The five switches the server supports, in display order. Nothing else may be offered. */
export const CONTEXT_OPTIONS: ContextOption[] = [
  { key: "medicines", labelKey: "assistant.ctx.medicines.label", hintKey: "assistant.ctx.medicines.hint", chipKey: "assistant.ctx.medicines.chip" },
  { key: "history", labelKey: "assistant.ctx.history.label", hintKey: "assistant.ctx.history.hint", chipKey: "assistant.ctx.history.chip" },
  { key: "labs", labelKey: "assistant.ctx.labs.label", hintKey: "assistant.ctx.labs.hint", chipKey: "assistant.ctx.labs.chip" },
  { key: "doses", labelKey: "assistant.ctx.doses.label", hintKey: "assistant.ctx.doses.hint", chipKey: "assistant.ctx.doses.chip" },
  { key: "allergies", labelKey: "assistant.ctx.allergies.label", hintKey: "assistant.ctx.allergies.hint", chipKey: "assistant.ctx.allergies.chip" },
];

/** The switches that are on, in display order. Reads only what the server last returned. */
export const activeContext = (context: AssistantContext): ContextOption[] =>
  CONTEXT_OPTIONS.filter((o) => context[o.key] === true);

/** Suggested questions: static and generic. They never mention the person's data. */
export const SUGGESTED_PROMPTS: MessageKey[] = [
  "assistant.prompt.1",
  "assistant.prompt.2",
  "assistant.prompt.3",
  "assistant.prompt.4",
];

/** Suggested questions in prototype open mode. */
export const SUGGESTED_PROMPTS_OPEN: MessageKey[] = [
  "assistant.prompt.open.1",
  "assistant.prompt.open.2",
  "assistant.prompt.open.3",
  "assistant.prompt.open.4",
];

/* ------------------------------------------------------------------ evidence */
export const SOURCE_LABEL_KEY: Record<EvidenceItem["source_type"], MessageKey> = {
  lab_result: "assistant.source.lab_result",
  medication: "assistant.source.medication",
  dose_log: "assistant.source.dose_log",
  condition: "assistant.source.condition",
  allergy: "assistant.source.allergy",
  health_record: "assistant.source.health_record",
  reference: "assistant.source.reference",
  derived: "assistant.source.derived",
};

/** English source labels (kept for callers that do not translate). */
export const SOURCE_LABEL = Object.fromEntries(
  Object.entries(SOURCE_LABEL_KEY).map(([k, v]) => [k, en[v]]),
) as Record<EvidenceItem["source_type"], string>;

/** Pages that exist for a kind of evidence. Reference notes and calculated values have none. */
const SOURCE_ROUTE: Partial<Record<EvidenceItem["source_type"], string>> = {
  lab_result: "/labs",
  medication: "/medications",
  dose_log: "/medications",
  condition: "/profile",
  allergy: "/profile",
  health_record: "/records",
};

/** Where to open the underlying record, only when the API named a record and a page exists. */
export function evidenceHref(e: EvidenceItem): string | null {
  if (!e.source_record_id) return null;
  return SOURCE_ROUTE[e.source_type] ?? null;
}

/** Evidence that came from the person's own records (as opposed to reference notes or calculations). */
export const isPatientEvidence = (e: EvidenceItem): boolean =>
  e.source_type !== "reference" && e.source_type !== "derived";

export const evidenceDate = (e: EvidenceItem) => (e.recorded_at ? e.recorded_at : "no date");

/** Evidence the answer relied on first, then the rest, each group in E-number order. */
export function orderEvidence(items: EvidenceItem[]): EvidenceItem[] {
  const n = (e: EvidenceItem) => Number(e.ref.slice(1));
  return [...items].sort((a, b) => Number(b.cited) - Number(a.cited) || n(a) - n(b));
}

/* ------------------------------------------------------------------ answer mode */
export const MODE_NOTE_KEY: Record<AssistantMode, MessageKey> = {
  open: "assistant.mode.note.open",
  llm: "assistant.mode.note.llm",
  evidence_only: "assistant.mode.note.evidence_only",
  fallback: "assistant.mode.note.fallback",
  canned: "assistant.mode.note.canned",
};

/** English notes (kept for callers that do not translate). */
export const MODE_NOTE: Record<AssistantMode, string> = {
  open: en["assistant.mode.note.open"],
  llm: en["assistant.mode.note.llm"],
  evidence_only: en["assistant.mode.note.evidence_only"],
  fallback: en["assistant.mode.note.fallback"],
  canned: en["assistant.mode.note.canned"],
};

export interface ModeBadge {
  key: MessageKey;
  tone: "ai" | "neutral" | "caution";
}

/**
 * The badge for one answer. "From your records" is only claimed when the API actually returned
 * evidence from the person's records for that answer; otherwise it says no records were used.
 */
export function modeBadge(message: Pick<ChatMessage, "mode" | "evidence">): ModeBadge | null {
  switch (message.mode) {
    case "open":
      return { key: "assistant.mode.open", tone: "ai" };
    case "llm":
      return message.evidence.some(isPatientEvidence)
        ? { key: "assistant.mode.llmRecords", tone: "ai" }
        : { key: "assistant.mode.llmNoRecords", tone: "ai" };
    case "evidence_only":
      return { key: "assistant.mode.evidenceOnly", tone: "neutral" };
    case "fallback":
      return { key: "assistant.mode.fallback", tone: "caution" };
    case "canned":
      return { key: "assistant.mode.canned", tone: "neutral" };
    default:
      return null;
  }
}

/** Safety classifications that change how the answer is framed. Anything else is shown as is. */
export type SafetyFraming = "urgent" | "no_diagnosis" | "no_treatment" | null;
export function safetyFraming(classification: string | null): SafetyFraming {
  if (classification === "urgent_escalation") return "urgent";
  if (classification === "declined_diagnosis") return "no_diagnosis";
  if (classification === "declined_treatment") return "no_treatment";
  return null;
}

/* ------------------------------------------------------------------ citations */
export type Segment = { kind: "text"; text: string } | { kind: "cite"; ref: string };

/** Splits an answer into text and [E#] citation markers. Output is always rendered as text. */
export function splitCitations(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(/\[(E\d+)\]/g)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: "text", text: text.slice(last, at) });
    out.push({ kind: "cite", ref: m[1]! });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

/** The answer as plain copyable text: citation markers stay, nothing else is added. */
export const copyableAnswer = (message: Pick<ChatMessage, "content">): string => message.content.trim();

/* ------------------------------------------------------------------ errors */
const ERROR_KEY: Record<string, MessageKey> = {
  AI_CONTEXT_CONSENT_REQUIRED: "assistant.err.consent",
  SESSION_FULL: "assistant.err.sessionFull",
  SESSION_LIMIT: "assistant.err.sessionLimit",
};

/** A translated message for the errors the assistant can return on purpose, else null. */
export function assistantErrorKey(error: unknown): MessageKey | null {
  if (!(error instanceof ApiError)) return null;
  if (ERROR_KEY[error.code]) return ERROR_KEY[error.code]!;
  if (error.status === 429) return "assistant.err.rate";
  return null;
}

/* ------------------------------------------------------------------ time */
/** "17 Nov 2026, 9:30 am" in the person's time zone; falls back to the browser's zone if it is invalid. */
export function formatMessageTime(iso: string, timeZone: string | null | undefined, language: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const locale = language === "hi" ? "hi-IN" : language === "or" ? "or-IN" : "en-IN";
  const opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };
  try {
    return new Intl.DateTimeFormat(locale, { ...opts, timeZone: timeZone || undefined }).format(d);
  } catch {
    return new Intl.DateTimeFormat(locale, opts).format(d);
  }
}

/** True when the scroll container is within `slack` px of the bottom. */
export const isNearBottom = (el: { scrollHeight: number; scrollTop: number; clientHeight: number }, slack = 80) =>
  el.scrollHeight - el.scrollTop - el.clientHeight <= slack;

/** Label of the page an evidence link opens (reuses the navigation labels). */
export const EVIDENCE_PAGE_KEY: Record<string, MessageKey> = {
  "/labs": "nav.labs",
  "/medications": "nav.medicines",
  "/profile": "nav.health",
  "/records": "nav.records",
};
