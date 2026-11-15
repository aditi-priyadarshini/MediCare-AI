"use client";

import { useState } from "react";
import { Alert, Button, Card, TextField } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import {
  BASIS_TEXT,
  bySeverity,
  CHECKS,
  outcomeText,
  parseList,
  SEVERITY_LABEL,
  SEVERITY_TONE,
  sourceLine,
} from "@/lib/safety";
import type { SafetyCheck, SafetyCheckName, SafetyChecks, SafetyFinding } from "@/lib/types";

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
        <p className="mt-1 font-medium text-amber-600">
          Sources disagree about how serious this is. Both are shown.
        </p>
      )}
      <p className="mt-2 text-xs text-ink-soft">Source: {sourceLine(f.source)}</p>
    </li>
  );
}

function Result({ title, blurb, check }: { title: string; blurb: string; check: SafetyCheck }) {
  const count = check.findings.length + check.allergy_findings.length;
  const o = outcomeText(check.outcome, count);
  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-ink">{title}</h3>
      <p className="text-sm text-ink-soft">{blurb}</p>
      <Alert tone={o.tone} title={o.title}>
        {o.body}
      </Alert>
      {check.findings.length > 0 && (
        <ul className="space-y-2">
          {bySeverity(check.findings).map((f) => (
            <Finding key={`${f.rule_id}-${f.medication_ids.join("-")}`} f={f} />
          ))}
        </ul>
      )}
      {check.allergy_findings.length > 0 && (
        <ul className="space-y-2">
          {check.allergy_findings.map((a) => (
            <li key={`${a.allergy_id}-${a.medication_id}-${a.ingredient_name}`} className="rounded-lg border border-line p-3 text-sm">
              <p className="font-semibold text-ink">Possible match: {a.medication_name}</p>
              <p className="mt-1 text-ink">
                Your allergy “{a.allergy_text}”
                {a.allergy_severity ? ` (${a.allergy_severity})` : ""} {BASIS_TEXT[a.basis]} {a.ingredient_name}.
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

export function CheckCard() {
  const [foods, setFoods] = useState("");
  const [results, setResults] = useState<SafetyChecks | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setFailure(null);
    const list = parseList(foods);
    try {
      const entries = await Promise.all(
        CHECKS.map(async (c) => {
          const body = c.name === "drug-food" && list.length ? { foods: list } : {};
          return [c.name, await api<SafetyCheck>(`/safety/${c.name}/check`, { method: "POST", body })] as const;
        }),
      );
      setResults(Object.fromEntries(entries) as Record<SafetyCheckName, SafetyCheck>);
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card aria-labelledby="check-h" className="space-y-4">
      <div>
        <h2 id="check-h" className="text-lg font-semibold text-ink">
          Check my medicines
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Looks at the medicines you are taking now, your conditions and your allergies, using a limited reference
          dataset. It cannot tell you that something is safe.
        </p>
      </div>
      <TextField
        label="Foods or drinks to check (optional)"
        hint="Separate with commas, for example: grapefruit, milk. Leave blank to see all food notes."
        value={foods}
        onChange={(e) => setFoods(e.target.value)}
        maxLength={400}
      />
      <Button onClick={run} loading={busy}>
        Run checks
      </Button>
      {failure && <Alert tone="danger" title="The check did not run">{failure}</Alert>}
      {results && (
        <div className="space-y-6" aria-live="polite">
          {CHECKS.map((c) => (
            <Result key={c.name} title={c.title} blurb={c.blurb} check={results[c.name]} />
          ))}
          <p className="text-sm text-ink-soft">{results["drug-drug"].disclaimer}</p>
        </div>
      )}
    </Card>
  );
}
