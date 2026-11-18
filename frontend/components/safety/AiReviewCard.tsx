"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Card, TextField } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  contextLine,
  FREQUENCY_LABEL,
  groupIssues,
  ORIGIN_CHIP,
  ORIGIN_LABEL,
  parseList,
  REVIEW_SECTION_LABEL,
  reviewStatusText,
  SEVERITY_CHIP,
  SEVERITY_LABEL,
} from "@/lib/safety";
import type { AiReview, MedicineReview, ReviewIssue } from "@/lib/types";

function IssueRow({ issue }: { issue: ReviewIssue }) {
  return (
    <li className="space-y-1 rounded-lg border border-line p-3 text-sm">
      <p className="font-semibold text-ink">{issue.title}</p>
      <p>
        <span className={cn("mr-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold", SEVERITY_CHIP[issue.severity])}>
          {SEVERITY_LABEL[issue.severity]}
        </span>
        <span className={cn("mr-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold", ORIGIN_CHIP[issue.origin])}>
          {ORIGIN_LABEL[issue.origin]}
        </span>
        {issue.detail}
      </p>
      {issue.guidance && <p className="text-ink-soft">{issue.guidance}</p>}
      {issue.source && <p className="text-xs text-ink-soft">Source: {issue.source}</p>}
    </li>
  );
}

function Effects({ medicine, helpText }: { medicine: MedicineReview; helpText: string }) {
  if (medicine.effects.length === 0) return null;
  const serious = medicine.effects.filter((e) => e.serious);
  return (
    <details className="rounded-lg border border-line p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        Side effects of {medicine.name}
        {serious.length > 0 && <span className="ml-2 text-xs text-danger-700">{serious.length} can be serious</span>}
      </summary>
      <ul className="mt-2 space-y-1">
        {medicine.effects.map((e) => (
          <li key={e.effect + e.origin}>
            <span className="text-ink">{e.effect}</span>
            <span className="text-ink-soft">
              {" "}
              · {FREQUENCY_LABEL[e.frequency]}
              {e.serious ? " · can be serious" : ""} · {ORIGIN_LABEL[e.origin]}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-soft">{helpText}</p>
    </details>
  );
}

/**
 * One AI review of everything: interactions between medicines, contraindications for the
 * patient's conditions, allergy matches, food, age and side effects. Reference data comes first,
 * the AI's findings are labelled, and nothing here ever says a medicine is safe.
 * `?run=1` in the address starts it straight away (used after adding a medicine).
 */
export function AiReviewCard() {
  const [result, setResult] = useState<AiReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [foods, setFoods] = useState("");
  const [candidate, setCandidate] = useState("");
  const started = useRef(false);

  async function run() {
    setBusy(true);
    setFailure(null);
    const list = parseList(foods);
    const name = candidate.trim();
    try {
      setResult(
        await api<AiReview>("/safety/ai-review", {
          method: "POST",
          body: { ...(list.length ? { foods: list } : {}), ...(name ? { candidate_name: name } : {}) },
        }),
      );
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (started.current || typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("run") === "1") {
      started.current = true;
      void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const status = result ? reviewStatusText(result.status, result.counts) : null;
  const groups = result ? groupIssues(result.issues) : [];
  const warn = result && ["consent_required", "ai_unavailable", "partial", "too_few", "too_many"].includes(result.mode);

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Full safety review with AI</h2>
        <p className="text-sm text-ink-soft">
          Checks every medicine against the others, your health conditions, your allergies, your age and the foods you
          list, and shows known side effects. Only medicine, condition and allergy names and an age group are sent, never
          your name or contact details, and only if you allowed AI use in Settings.
        </p>
      </div>
      <TextField
        label="Foods or drinks to check (optional)"
        hint="Separate with commas, for example grapefruit, alcohol"
        value={foods}
        onChange={(e) => setFoods(e.target.value)}
        autoComplete="off"
      />
      <TextField
        label="Thinking of starting a medicine? (optional)"
        hint="Type its name to check it against what you already take. It is not added to your list."
        value={candidate}
        onChange={(e) => setCandidate(e.target.value)}
        maxLength={60}
        autoComplete="off"
      />
      <Button onClick={run} loading={busy}>
        {result ? "Review again" : "Run the review"}
      </Button>

      {failure && (
        <Alert tone="danger" title="The review did not run">
          {failure}
        </Alert>
      )}

      {result && (
        <div className="space-y-4" aria-live="polite">
          {warn && (
            <Alert tone="warning" title="Please note">
              {result.message}
            </Alert>
          )}
          {status && (
            <div className="space-y-1">
              <Alert tone={status.tone} title={status.title}>
                {status.body}
              </Alert>
              <p className="text-xs text-ink-soft">{contextLine(result.context)}</p>
            </div>
          )}
          {!warn && <p className="text-sm text-ink-soft">{result.message}</p>}

          {groups.map((g) => (
            <section key={g.section} className="space-y-2">
              <h3 className="text-sm font-semibold uppercase text-ink-soft">{REVIEW_SECTION_LABEL[g.section]}</h3>
              <ul className="space-y-2">
                {g.items.map((i, n) => (
                  <IssueRow key={`${i.section}-${i.title}-${i.origin}-${n}`} issue={i} />
                ))}
              </ul>
            </section>
          ))}

          {result.unrecognised.length > 0 && (
            <Alert tone="info" title="The AI did not recognise">
              {result.unrecognised.join(", ")}. Nothing was checked for {result.unrecognised.length === 1 ? "it" : "them"}.
              Ask a pharmacist.
            </Alert>
          )}

          {result.medicines.some((m) => m.effects.length > 0) && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold uppercase text-ink-soft">Side effects to know about</h3>
              {result.medicines.map((m) => (
                <Effects key={m.name} medicine={m} helpText={result.help_text} />
              ))}
            </section>
          )}

          {result.notes.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
              {result.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <p className="text-xs text-ink-soft">
            {result.ai_label} {result.disclaimer}
          </p>
        </div>
      )}
    </Card>
  );
}
