"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Card, EmptyState, Skeleton, TextField } from "@/components/ui/primitives";
import { LinkButton } from "@/components/ui/LinkButton";
import { api, errorMessage } from "@/lib/api-client";
import { CHECKS, parseList } from "@/lib/safety";
import type { CheckKey, SafetyOverview } from "@/lib/types";
import { CheckResult } from "./CheckResults";
import { EffectsPanel, ExplainPanel, IssueList, StatusBanner } from "./parts";

const keyOf = (name: string) => name.replace("-", "_") as CheckKey;

/**
 * "My medicines": one overall status for everything the patient takes, the issues behind it
 * (most serious first), what to watch for with each medicine, and the detailed checks.
 * It runs when the page opens, so the status is the first thing seen.
 */
export function CheckCard() {
  const [foods, setFoods] = useState("");
  const [typed, setTyped] = useState<string[]>([]);
  const [data, setData] = useState<SafetyOverview | null>(null);
  const [busy, setBusy] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const seq = useRef(0);

  const run = useCallback(async (list: string[]) => {
    const n = ++seq.current;
    setBusy(true);
    setFailure(null);
    try {
      const result = await api<SafetyOverview>("/safety/overview", {
        method: "POST",
        body: list.length ? { foods: list } : {},
      });
      if (n !== seq.current) return;
      setData(result);
      setTyped(list);
    } catch (e) {
      if (n === seq.current) setFailure(errorMessage(e));
    } finally {
      if (n === seq.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    void run([]);
  }, [run]);

  return (
    <Card className="space-y-4">
      <div className="flex justify-end">
        <Button variant="secondary" onClick={() => run(typed)} loading={busy && data !== null}>
          Check again
        </Button>
      </div>

      {failure && (
        <Alert tone="danger" title="The check did not run">
          {failure}
        </Alert>
      )}
      {busy && !data && !failure && (
        <div aria-busy="true" aria-label="Checking your medicines" className="space-y-2">
          <Skeleton variant="row" />
          <Skeleton variant="row" />
        </div>
      )}

      {data && data.context.medications === 0 && (
        <EmptyState
          title="No medicines on your list yet"
          action={<LinkButton href="/medications">Add a medicine</LinkButton>}
        >
          Add what you take and this page will check it for you. You can also look up any medicine from the Safety page.
        </EmptyState>
      )}

      {data && data.context.medications > 0 && (
        <div className="space-y-5">
          <StatusBanner status={data.status} counts={data.counts} context={data.context} />
          <IssueList issues={data.issues} heading="What needs your attention" />
          {data.notes.length > 0 && (
            <ul className="space-y-1 text-sm text-ink-soft">
              {data.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}

          <div className="space-y-2">
            <TextField
              label="Foods or drinks to check (optional)"
              hint="Separate with commas, for example: grapefruit, alcohol. Leave blank to see the general food notes."
              value={foods}
              onChange={(e) => setFoods(e.target.value)}
              maxLength={400}
            />
            <Button variant="secondary" onClick={() => run(parseList(foods))} loading={busy}>
              Check these foods
            </Button>
          </div>

          {data.watch_for.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold text-ink">What to watch for</h3>
              <p className="text-sm text-ink-soft">
                Side effects reported for the medicines you take. Most people have none or only mild ones.
              </p>
              {data.watch_for.map((w) => (
                <details key={w.medication_id ?? w.medication_name} className="rounded-lg border border-line px-3">
                  <summary className="min-h-[44px] cursor-pointer py-3 text-sm font-semibold text-ink">
                    {w.medication_name}
                  </summary>
                  <div className="pb-3">
                    <EffectsPanel effects={w.effects} />
                  </div>
                </details>
              ))}
            </div>
          )}

          <ExplainPanel foods={typed} />

          <details className="rounded-lg border border-line px-3">
            <summary className="min-h-[44px] cursor-pointer py-3 text-sm font-semibold text-ink">
              All four checks in detail
            </summary>
            <div className="space-y-6 pb-3">
              {CHECKS.map((c) => (
                <CheckResult key={c.name} title={c.title} blurb={c.blurb} check={data.checks[keyOf(c.name)]} />
              ))}
            </div>
          </details>
          <p className="text-sm text-ink-soft">{data.disclaimer}</p>
        </div>
      )}
    </Card>
  );
}
