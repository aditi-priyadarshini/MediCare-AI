"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Card, TextField } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { CHECKS, parseList } from "@/lib/safety";
import type { CheckKey, MedicineHit, PersonalCheck } from "@/lib/types";
import { CheckResult } from "./CheckResults";
import { EffectsPanel, ExplainPanel, IssueList, StatusBanner } from "./parts";

const keyOf = (name: string) => name.replace("-", "_") as CheckKey;

/**
 * Search any medicine by name and see, for this patient: interactions with what they take,
 * contraindications for their conditions, allergy matches, and its side effects. Looking a
 * medicine up never adds it to their list.
 */
export function LookupCard() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<MedicineHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [picked, setPicked] = useState<MedicineHit | null>(null);
  const [foods, setFoods] = useState("");
  const [typed, setTyped] = useState<string[]>([]);
  const [result, setResult] = useState<PersonalCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const seq = useRef(0);

  // Type-ahead: wait for a short pause, and ignore answers that arrive out of order.
  useEffect(() => {
    const text = q.trim();
    if (picked || text.length < 2) {
      setHits([]);
      setSearched(false);
      return;
    }
    const n = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        const found = await api<MedicineHit[]>(`/medicines?q=${encodeURIComponent(text)}`);
        if (n === seq.current) {
          setHits(found);
          setSearched(true);
        }
      } catch {
        if (n === seq.current) {
          setHits([]);
          setSearched(true);
        }
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q, picked]);

  async function check(h: MedicineHit, list: string[]) {
    setBusy(true);
    setFailure(null);
    try {
      const out = await api<PersonalCheck>(`/safety/medicines/${h.id}/personal-check`, {
        method: "POST",
        body: list.length ? { foods: list } : {},
      });
      setResult(out);
      setTyped(list);
    } catch (e) {
      setResult(null);
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function pick(h: MedicineHit) {
    seq.current++;
    setHits([]);
    setSearched(false);
    setPicked(h);
    setQ(`${h.name}${h.strength_text ? ` ${h.strength_text}` : ""}`);
    setFoods("");
    void check(h, []);
  }

  function edit(value: string) {
    setQ(value);
    if (picked) {
      setPicked(null);
      setResult(null);
      setFailure(null);
    }
  }

  const m = result?.medicine;

  return (
    <Card className="space-y-4">
      <TextField
        label="Medicine name"
        hint="Type at least two letters, for example: ibuprofen"
        value={q}
        onChange={(e) => edit(e.target.value)}
        autoComplete="off"
        maxLength={50}
      />
      {hits.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line" aria-label="Matching medicines">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => pick(h)}
                className="min-h-[44px] w-full px-3 text-left text-sm hover:bg-mint-100"
              >
                {h.name} {h.strength_text} <span className="text-ink-soft">{h.form}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {searched && hits.length === 0 && !picked && (
        <p className="text-sm text-ink-soft" role="status">
          No medicine with that name in the catalogue. Check the spelling, or ask a pharmacist.
        </p>
      )}
      {failure && (
        <Alert tone="danger" title="Could not check this medicine">
          {failure}
        </Alert>
      )}
      {busy && <p className="text-sm text-ink-soft" role="status">Checking against your details…</p>}

      {result && m && (
        <div className="space-y-5" aria-live="polite">
          <div className="rounded-lg border border-line p-3 text-sm">
            <p className="font-semibold text-ink">
              {m.name}
              {m.strength_text ? ` ${m.strength_text}` : ""}
            </p>
            <p className="text-ink-soft">
              {[m.form, m.ingredients.length ? `Contains ${m.ingredients.join(", ")}` : "Active ingredients not recorded"]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {result.already_taking && (
              <p className="mt-1 font-medium text-info-700">You already take this on your list.</p>
            )}
          </div>

          <StatusBanner status={result.status} counts={result.counts} context={result.context} />
          <IssueList issues={result.issues} heading="What this means for you" />
          {result.notes.length > 0 && (
            <ul className="space-y-1 text-sm text-ink-soft">
              {result.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}

          <div className="space-y-2">
            <h3 className="font-semibold text-ink">Side effects</h3>
            <EffectsPanel effects={result.effects} />
          </div>

          <div className="space-y-2">
            <TextField
              label="Foods or drinks to check with it (optional)"
              hint="Separate with commas, for example: grapefruit, alcohol."
              value={foods}
              onChange={(e) => setFoods(e.target.value)}
              maxLength={400}
            />
            {picked && (
              <Button variant="secondary" onClick={() => check(picked, parseList(foods))} loading={busy}>
                Check these foods
              </Button>
            )}
          </div>

          <ExplainPanel medicineId={m.id} foods={typed} />

          <details className="rounded-lg border border-line px-3">
            <summary className="min-h-[44px] cursor-pointer py-3 text-sm font-semibold text-ink">
              All four checks in detail
            </summary>
            <div className="space-y-6 pb-3">
              {CHECKS.map((c) => (
                <CheckResult key={c.name} title={c.title} blurb={c.blurb} check={result.checks[keyOf(c.name)]} />
              ))}
            </div>
          </details>
          <p className="text-sm text-ink-soft">{result.disclaimer}</p>
        </div>
      )}
    </Card>
  );
}
