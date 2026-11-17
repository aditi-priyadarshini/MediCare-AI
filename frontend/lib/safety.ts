import type {
  AdverseEffect,
  Authenticity,
  EffectFrequency,
  EffectSeriousness,
  ExplainMode,
  IssueSection,
  Price,
  SafetyStatus,
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

/* ------------------------------------------------------------- personalised status */
export type Tone = "warning" | "info" | "danger";

/**
 * The overall status in plain words. Like `outcomeText`, nothing here says "safe", "clear" or
 * "success": the calmest status only says that nothing in a limited dataset matched.
 */
export function statusText(
  status: SafetyStatus,
  counts: { needs_attention: number; review: number },
): { tone: Tone; title: string; body: string } {
  const n = (k: number, one: string, many: string) => (k === 1 ? one : many.replace("{n}", String(k)));
  if (status === "needs_attention") {
    const extra = counts.review > 0 ? ` ${n(counts.review, "1 more note is worth reviewing.", "{n} more notes are worth reviewing.")}` : "";
    return {
      tone: "danger",
      title: "Needs attention",
      body: `${n(counts.needs_attention, "1 serious note", "{n} serious notes")} for you.${extra} Talk to a pharmacist or your prescriber before you take, stop or change anything.`,
    };
  }
  if (status === "review") {
    return {
      tone: "warning",
      title: "Worth reviewing",
      body: `${n(counts.review, "1 note", "{n} notes")} to go over with a pharmacist or your prescriber. None is marked serious in this dataset.`,
    };
  }
  if (status === "no_matching_record") {
    return {
      tone: "info",
      title: "No matching record",
      body: "Nothing in this limited dataset matches what we know about you. That is not the same as being cleared. Ask a pharmacist if you are unsure.",
    };
  }
  return {
    tone: "info",
    title: "Not enough information to check",
    body: "Add what is missing (see the notes below) or ask a pharmacist.",
  };
}

export const SECTION_LABEL: Record<IssueSection, string> = {
  drug_drug: "Interaction",
  drug_condition: "Health condition",
  drug_food: "Food and drink",
  allergy: "Allergy",
  duplicate: "Same ingredient twice",
};

/** Chip colours by severity. The label always carries the meaning; colour only reinforces it. */
export const SEVERITY_CHIP: Record<Severity, string> = {
  contraindicated: "bg-danger-100 text-danger-700",
  major: "bg-danger-100 text-danger-700",
  moderate: "bg-amber-100 text-amber-600",
  minor: "bg-info-100 text-info-700",
  unknown: "bg-info-100 text-info-700",
};

export const FREQUENCY_LABEL: Record<EffectFrequency, string> = {
  very_common: "Very common",
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  unknown: "Frequency not established",
};

export const SERIOUSNESS_LABEL: Record<EffectSeriousness, string> = {
  serious: "Can be serious",
  moderate: "Moderate",
  mild: "Usually mild",
};

/** Serious effects first, then the more frequently reported, then alphabetical. */
const FREQ_RANK: Record<EffectFrequency, number> = { very_common: 4, common: 3, uncommon: 2, rare: 1, unknown: 0 };
const SERIOUS_RANK: Record<EffectSeriousness, number> = { serious: 2, moderate: 1, mild: 0 };
export function sortEffects(items: AdverseEffect[]): AdverseEffect[] {
  return [...items].sort(
    (a, b) =>
      SERIOUS_RANK[b.seriousness] - SERIOUS_RANK[a.seriousness] ||
      FREQ_RANK[b.frequency] - FREQ_RANK[a.frequency] ||
      a.effect.localeCompare(b.effect),
  );
}

export function splitEffects(items: AdverseEffect[]): { serious: AdverseEffect[]; other: AdverseEffect[] } {
  const sorted = sortEffects(items);
  return {
    serious: sorted.filter((e) => e.seriousness === "serious"),
    other: sorted.filter((e) => e.seriousness !== "serious"),
  };
}

export function contextLine(c: { medications: number; conditions: number; allergies: number }): string {
  const part = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return `Based on ${part(c.medications, "medicine", "medicines")}, ${part(c.conditions, "health condition", "health conditions")} and ${part(c.allergies, "allergy", "allergies")} recorded for you.`;
}

export const EXPLAIN_MODE_TEXT: Record<ExplainMode, string> = {
  ai: "Written by an AI model from the findings above. Check it against the list.",
  evidence_only: "No AI model was used. This is a plain summary of the findings.",
  fallback: "The AI draft did not pass our checks, so this is a plain summary of the findings.",
  consent_required: "AI is switched off for your records, so nothing was sent anywhere.",
};
