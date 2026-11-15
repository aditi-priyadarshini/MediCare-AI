import type { AssistantMode, ContextKey, EvidenceItem } from "./types";

export const CONTEXT_OPTIONS: { key: ContextKey; label: string; hint: string }[] = [
  { key: "medicines", label: "My current medicines", hint: "Names, strengths, start and end dates." },
  { key: "history", label: "My medical history", hint: "Conditions and the titles and dates of your records." },
  { key: "labs", label: "My test results", hint: "Values with units, dates and report ranges." },
  { key: "doses", label: "My dose history", hint: "Counts of doses you marked in the last 14 days." },
  { key: "allergies", label: "My allergies", hint: "Substances, reactions and severity." },
];

export const SOURCE_LABEL: Record<EvidenceItem["source_type"], string> = {
  lab_result: "Test result",
  medication: "Medicine",
  dose_log: "Dose log",
  condition: "Condition",
  allergy: "Allergy",
  health_record: "Health record",
  reference: "Medicine reference",
  derived: "Calculated by the system",
};

export const MODE_NOTE: Record<AssistantMode, string> = {
  llm: "Written by an AI model from the evidence below, then checked.",
  evidence_only: "Listed from your records. No AI model wrote this.",
  fallback: "The AI draft did not pass our checks, so your records are listed as recorded.",
  canned: "Standard safety text.",
};

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

/** Evidence the answer relied on first, then the rest, each group in E-number order. */
export function orderEvidence(items: EvidenceItem[]): EvidenceItem[] {
  const n = (e: EvidenceItem) => Number(e.ref.slice(1));
  return [...items].sort((a, b) => Number(b.cited) - Number(a.cited) || n(a) - n(b));
}

export const evidenceDate = (e: EvidenceItem) => (e.recorded_at ? e.recorded_at : "no date");
