"use client";

import { useState } from "react";
import { Alert, Button } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  contextLine,
  EXPLAIN_MODE_TEXT,
  FREQUENCY_LABEL,
  SECTION_LABEL,
  SERIOUSNESS_LABEL,
  SEVERITY_CHIP,
  SEVERITY_LABEL,
  sourceLine,
  splitEffects,
  statusText,
} from "@/lib/safety";
import type {
  AdverseEffect,
  Explanation,
  PersonalContext,
  SafetyIssue,
  SafetyStatus,
} from "@/lib/types";

/** The overall result, in words. Never "safe": see statusText. */
export function StatusBanner({
  status,
  counts,
  context,
}: {
  status: SafetyStatus;
  counts: { needs_attention: number; review: number };
  context: PersonalContext;
}) {
  const s = statusText(status, counts);
  return (
    <div className="space-y-1" aria-live="polite">
      <Alert tone={s.tone} title={s.title}>
        {s.body}
      </Alert>
      <p className="text-xs text-ink-soft">{contextLine(context)}</p>
    </div>
  );
}

export function SeverityChip({ severity }: { severity: SafetyIssue["severity"] }) {
  return (
    <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-semibold", SEVERITY_CHIP[severity])}>
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

/** Everything that matters for this person, most serious first. */
export function IssueList({ issues, heading }: { issues: SafetyIssue[]; heading?: string }) {
  if (issues.length === 0) return null;
  return (
    <div className="space-y-2">
      {heading && <h3 className="font-semibold text-ink">{heading}</h3>}
      <ul className="space-y-2">
        {issues.map((i, idx) => (
          <li key={`${i.section}-${i.title}-${idx}`} className="rounded-lg border border-line p-3 text-sm">
            <p className="flex flex-wrap items-center gap-2">
              <SeverityChip severity={i.severity} />
              <span className="text-xs font-semibold uppercase text-ink-soft">{SECTION_LABEL[i.section]}</span>
            </p>
            <p className="mt-1 font-semibold text-ink">{i.title}</p>
            <p className="mt-1 text-ink">{i.detail}</p>
            {i.guidance && <p className="mt-1 text-ink-soft">{i.guidance}</p>}
            {i.source && <p className="mt-2 text-xs text-ink-soft">Source: {sourceLine(i.source)}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EffectRow({ e }: { e: AdverseEffect }) {
  return (
    <li className="rounded-lg border border-line p-3 text-sm">
      <p className="font-semibold text-ink">{e.effect}</p>
      <p className="text-ink-soft">
        {FREQUENCY_LABEL[e.frequency]} · {SERIOUSNESS_LABEL[e.seriousness]}
      </p>
      {e.when_to_get_help && <p className="mt-1 text-ink">{e.when_to_get_help}</p>}
      <p className="mt-2 text-xs text-ink-soft">Source: {sourceLine(e.source)}</p>
    </li>
  );
}

/** Adverse effects: the ones that can be serious come first and are never hidden. */
export function EffectsPanel({ effects, empty }: { effects: AdverseEffect[]; empty?: string }) {
  const { serious, other } = splitEffects(effects);
  if (effects.length === 0) {
    return <p className="text-sm text-ink-soft">{empty ?? "No side effects are recorded in this dataset for it. That does not mean there are none."}</p>;
  }
  return (
    <div className="space-y-3">
      {serious.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-ink">Get help quickly if you notice</h4>
          <ul className="space-y-2">
            {serious.map((e) => (
              <EffectRow key={e.id} e={e} />
            ))}
          </ul>
        </div>
      )}
      {other.length > 0 && (
        <details>
          <summary className="min-h-[44px] cursor-pointer py-2 text-sm font-semibold text-teal-700">
            Other possible effects ({other.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {other.map((e) => (
              <EffectRow key={e.id} e={e} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * "Explain this for me". The server decides what is flagged; this only asks for the same
 * findings in plain words. The model is used only with the patient's consent, and the server
 * falls back to a plain summary whenever the draft cannot be trusted.
 */
export function ExplainPanel({ medicineId, foods }: { medicineId?: string; foods?: string[] }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Explanation | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setFailure(null);
    try {
      const body: Record<string, unknown> = {};
      if (medicineId) body.medicine_id = medicineId;
      if (foods && foods.length) body.foods = foods;
      setResult(await api<Explanation>("/safety/explain", { method: "POST", body }));
    } catch (e) {
      setResult(null);
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-line p-3">
      <div>
        <h3 className="font-semibold text-ink">Explain this in plain words</h3>
        <p className="text-sm text-ink-soft">
          Uses an AI model only if you have allowed it in Settings. It can only restate the findings above.
        </p>
      </div>
      <Button variant="secondary" onClick={run} loading={busy}>
        {result ? "Explain again" : "Explain for me"}
      </Button>
      {failure && (
        <Alert tone="danger" title="Could not explain">
          {failure}
        </Alert>
      )}
      {result && (
        <div className="space-y-2" aria-live="polite">
          <p className="whitespace-pre-line text-sm text-ink">{result.text}</p>
          <p className="text-xs text-ink-soft">{EXPLAIN_MODE_TEXT[result.mode]}</p>
          {result.mode === "consent_required" && (
            <a href="/settings#privacy" className="inline-flex min-h-[44px] items-center text-sm font-medium text-teal-700 underline">
              Open privacy settings
            </a>
          )}
          {result.evidence.length > 0 && (
            <details>
              <summary className="min-h-[44px] cursor-pointer py-2 text-sm font-semibold text-teal-700">
                What this is based on
              </summary>
              <ul className="mt-1 space-y-1 text-xs text-ink-soft">
                {result.evidence.map((e) => (
                  <li key={e.ref}>
                    [{e.ref}] {e.text}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="text-xs text-ink-soft">{result.disclaimer}</p>
        </div>
      )}
    </div>
  );
}
