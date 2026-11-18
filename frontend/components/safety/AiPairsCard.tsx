"use client";

import { useState } from "react";
import { Alert, Button, Card } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import {
  AI_PAIR_CHIP,
  AI_PAIR_LABEL,
  SEVERITY_CHIP,
  SEVERITY_LABEL,
  splitPairs,
} from "@/lib/safety";
import type { AiPair, AiPairsResult, Severity } from "@/lib/types";
import { cn } from "@/lib/cn";

function PairRow({ pair }: { pair: AiPair }) {
  return (
    <li className="space-y-1.5 rounded-lg border border-line p-3">
      <p className="font-semibold">
        {pair.medication_a} + {pair.medication_b}
      </p>
      {pair.curated.map((c, i) => (
        <div key={i} className="text-sm">
          <span
            className={cn(
              "mr-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold",
              SEVERITY_CHIP[c.severity as Severity] ?? SEVERITY_CHIP.unknown,
            )}
          >
            {SEVERITY_LABEL[c.severity as Severity] ?? c.severity}
          </span>
          {c.description}
          {c.guidance && (
            <span className="block text-ink-soft">{c.guidance}</span>
          )}
          <span className="block text-xs text-ink-soft">
            Reference data: {c.source}
          </span>
        </div>
      ))}
      {pair.ai_severity && (
        <div className="text-sm">
          <span
            className={cn(
              "mr-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold",
              AI_PAIR_CHIP[pair.ai_severity],
            )}
          >
            {AI_PAIR_LABEL[pair.ai_severity]}
          </span>
          {pair.ai_note ?? ""}
        </div>
      )}
      {pair.state === "not_checked" && (
        <p className="text-sm text-ink-soft">Not checked.</p>
      )}
    </li>
  );
}

/**
 * Asks the AI about every pair of the patient's medicines. Results are labelled as AI-generated
 * and shown next to the curated reference data; "none reported" is never presented as safe.
 */
export function AiPairsCard() {
  const [result, setResult] = useState<AiPairsResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setFailure(null);
    try {
      setResult(
        await api<AiPairsResult>("/safety/ai-pairs", {
          method: "POST",
          body: {},
        }),
      );
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const { shown, quiet } = result
    ? splitPairs(result.pairs)
    : { shown: [], quiet: [] };
  const warn =
    result &&
    [
      "consent_required",
      "ai_unavailable",
      "partial",
      "too_few",
      "too_many",
    ].includes(result.mode);

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Check every pair with AI</h2>
        <p className="text-sm text-ink-soft">
          Asks the AI about each medicine with every other medicine you take,
          including ones our reference data does not cover. Only medicine names
          are sent, and only if you allowed AI use in Settings.
        </p>
      </div>
      <Button onClick={run} loading={busy}>
        {result ? "Check again" : "Check all pairs"}
      </Button>

      {failure && (
        <Alert tone="danger" title="The check did not run">
          {failure}
        </Alert>
      )}
      {result && (
        <div className="space-y-3">
          <Alert
            tone={warn ? "warning" : "info"}
            title={warn ? "Please note" : result.ai_label}
          >
            {result.message}
          </Alert>
          {shown.length > 0 && (
            <ul className="space-y-2" aria-label="Medicine pairs">
              {shown.map((p) => (
                <PairRow key={p.medication_a + p.medication_b} pair={p} />
              ))}
            </ul>
          )}
          {quiet.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">
                {quiet.length} {quiet.length === 1 ? "pair" : "pairs"} with no
                interaction reported or not sure
              </summary>
              <ul className="mt-2 space-y-2">
                {quiet.map((p) => (
                  <PairRow key={p.medication_a + p.medication_b} pair={p} />
                ))}
              </ul>
            </details>
          )}
          <p className="text-xs text-ink-soft">
            {result.ai_label} {result.disclaimer}
          </p>
        </div>
      )}
    </Card>
  );
}
