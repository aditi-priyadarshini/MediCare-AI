"use client";

import { Alert } from "@/components/ui/primitives";
import { BASIS_TEXT, bySeverity, outcomeText, SEVERITY_LABEL, sourceLine } from "@/lib/safety";
import type { SafetyCheck, SafetyFinding } from "@/lib/types";

function Finding({ f }: { f: SafetyFinding }) {
  return (
    <li className="rounded-lg border border-line p-3 text-sm">
      <p className="font-semibold text-ink">
        {SEVERITY_LABEL[f.severity]}
        <span className="font-normal text-ink-soft">
          {" "}
          · {f.medication_names.join(" + ")}
          {f.matched_term ? ` · ${f.matched_term}` : ""}
        </span>
      </p>
      <p className="mt-1 text-ink">{f.description}</p>
      {f.clinical_significance && <p className="mt-1 text-ink-soft">{f.clinical_significance}</p>}
      {f.guidance && <p className="mt-1 text-ink">{f.guidance}</p>}
      {f.conflict && (
        <p className="mt-1 font-medium text-amber-600">Sources disagree about how serious this is. Both are shown.</p>
      )}
      <p className="mt-2 text-xs text-ink-soft">Source: {sourceLine(f.source)}</p>
    </li>
  );
}

/** One check's outcome, findings, allergy matches, duplicates and notes. */
export function CheckResult({ title, blurb, check }: { title: string; blurb: string; check: SafetyCheck }) {
  const count = check.findings.length + check.allergy_findings.length;
  const o = outcomeText(check.outcome, count);
  return (
    <div className="space-y-2">
      <h4 className="font-semibold text-ink">{title}</h4>
      <p className="text-sm text-ink-soft">{blurb}</p>
      <Alert tone={o.tone} title={o.title}>
        {o.body}
      </Alert>
      {check.findings.length > 0 && (
        <ul className="space-y-2">
          {bySeverity(check.findings).map((f) => (
            <Finding key={`${f.rule_id}-${f.medication_ids.join("-")}-${f.matched_term ?? ""}`} f={f} />
          ))}
        </ul>
      )}
      {check.allergy_findings.length > 0 && (
        <ul className="space-y-2">
          {check.allergy_findings.map((a) => (
            <li
              key={`${a.allergy_id}-${a.medication_id}-${a.ingredient_name}`}
              className="rounded-lg border border-line p-3 text-sm"
            >
              <p className="font-semibold text-ink">Possible match: {a.medication_name}</p>
              <p className="mt-1 text-ink">
                Your allergy “{a.allergy_text}”{a.allergy_severity ? ` (${a.allergy_severity})` : ""}{" "}
                {BASIS_TEXT[a.basis]} {a.ingredient_name}.
              </p>
              <p className="mt-2 text-xs text-ink-soft">Source: {sourceLine(a.source)}</p>
            </li>
          ))}
        </ul>
      )}
      {check.duplicates.length > 0 && (
        <Alert tone="warning" title="Same ingredient more than once">
          {check.duplicates.map((d) => `${d.ingredient_name}: ${d.medication_names.join(", ")}`).join(". ")}.
        </Alert>
      )}
      {check.notes.map((n) => (
        <p key={n} className="text-sm text-ink-soft">
          {n}
        </p>
      ))}
    </div>
  );
}
