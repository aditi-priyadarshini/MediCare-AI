import type {
  Authenticity,
  Price,
  SafetyCheckName,
  SafetyFinding,
  SafetyOutcome,
  SafetySource,
  Severity,
} from "./types";

export const CHECKS: { name: SafetyCheckName; title: string; blurb: string }[] = [
  { name: "drug-drug", title: "Between your medicines", blurb: "Pairs of medicines on your list." },
  { name: "drug-condition", title: "With your health conditions", blurb: "Uses the active conditions in My Health." },
  { name: "drug-food", title: "With food and drink", blurb: "Notes about food that matter for a medicine." },
  { name: "allergy", title: "With your allergies", blurb: "Compares your allergy list with active ingredients." },
];

export const SEVERITY_LABEL: Record<Severity, string> = {
  contraindicated: "Contraindicated",
  major: "Major",
  moderate: "Moderate",
  minor: "Minor",
  unknown: "Severity not established",
};

export const SEVERITY_TONE: Record<Severity, "danger" | "warning" | "info"> = {
  contraindicated: "danger",
  major: "danger",
  moderate: "warning",
  minor: "info",
  unknown: "info",
};

/**
 * What a check outcome means in plain words. There is deliberately no "safe", "clear" or
 * "success" wording here: finding nothing in a limited dataset is not evidence of safety.
 */
export function outcomeText(outcome: SafetyOutcome, findings: number): { tone: "warning" | "info"; title: string; body: string } {
  if (outcome === "findings") {
    return {
      tone: "warning",
      title: findings === 1 ? "1 note to discuss" : `${findings} notes to discuss`,
      body: "Ask a pharmacist or your prescriber about these before changing anything.",
    };
  }
  if (outcome === "no_matching_record") {
    return {
      tone: "info",
      title: "No matching record in this dataset",
      body: "The dataset is limited, so this is not the same as being cleared. Ask a pharmacist if you are unsure.",
    };
  }
  return {
    tone: "info",
    title: "Not enough information to check",
    body: "Add what is missing (see below) or ask a pharmacist.",
  };
}

export const sourceLine = (s: SafetySource) =>
  `${s.name} · version ${s.version} · reviewed ${s.reviewed_at} · ${s.jurisdiction}`;

/** Most severe first; stable for equal severities. */
const RANK: Record<Severity, number> = { contraindicated: 4, major: 3, moderate: 2, minor: 1, unknown: 0 };
export const bySeverity = (items: SafetyFinding[]) =>
  [...items].sort((a, b) => RANK[b.severity] - RANK[a.severity]);

export const BASIS_TEXT = {
  ingredient_name: "matches the ingredient name",
  curated_term: "matches a term linked to this ingredient",
  drug_class: "matches the medicine’s drug class",
} as const;

/** Comma-separated text field into a clean list (blank and duplicate entries dropped). */
export function parseList(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const t = part.trim().replace(/\s+/g, " ");
    if (t) seen.add(t);
  }
  return [...seen];
}

export function formatMoney(amount: string | number, currency: string): string {
  const n = Number(amount);
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export function priceLine(p: Price): string {
  const pack = `${Number(p.pack_quantity)} ${p.pack_unit}`;
  const unit = `${formatMoney(Number(p.unit_price).toFixed(2), p.currency)} per ${p.pack_unit}`;
  return `${formatMoney(p.price, p.currency)} for ${pack} (${unit})`;
}

export function priceAge(p: Pick<Price, "age_days" | "stale">): string {
  const when = p.age_days === 0 ? "today" : p.age_days === 1 ? "1 day ago" : `${p.age_days} days ago`;
  return p.stale ? `Seen ${when}. This may be out of date.` : `Seen ${when}.`;
}

export const AUTH_TEXT: Record<Authenticity["status"], string> = {
  verified: "Verified against an authoritative source",
  mismatch: "Does not match the authoritative record",
  suspicious_for_review: "Suspicious: have a pharmacist review it",
  unable_to_verify: "Unable to verify",
};
