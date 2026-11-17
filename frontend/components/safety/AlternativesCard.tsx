"use client";

import { useRef, useState } from "react";
import { Alert, Card, EmptyState, TextField } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { priceAge, priceLine } from "@/lib/safety";
import type { Alternatives, MedicineCard, MedicineHit } from "@/lib/types";

function Medicine({ m, heading }: { m: MedicineCard; heading?: string }) {
  return (
    <div className="rounded-lg border border-line p-3 text-sm">
      {heading && <p className="text-xs font-semibold uppercase text-ink-soft">{heading}</p>}
      <p className="font-semibold text-ink">
        {m.name}
        {m.strength_text ? ` ${m.strength_text}` : ""}
      </p>
      <p className="text-ink-soft">
        {[m.form, m.route, m.release_type && `${m.release_type} release`].filter(Boolean).join(" · ") || "Form not recorded"}
      </p>
      <p className="mt-1 text-ink">
        {m.ingredients.length
          ? m.ingredients.map((i) => `${i.name}${i.strength_value ? ` ${Number(i.strength_value)} ${i.strength_unit}` : ""}`).join(", ")
          : "Active ingredients not recorded"}
      </p>
      {m.prices.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {m.prices.map((p) => (
            <li key={`${p.source_name}-${p.pack_unit}-${p.observed_at}`}>
              <span className="text-ink">{priceLine(p)}</span>
              <span className="block text-xs text-ink-soft">
                {p.source_name} · {p.jurisdiction}. {priceAge(p)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-ink-soft">No sourced price on record.</p>
      )}
    </div>
  );
}

export function AlternativesCard() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<MedicineHit[]>([]);
  const [result, setResult] = useState<Alternatives | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const seq = useRef(0);

  async function search(value: string) {
    setQ(value);
    const n = ++seq.current;
    if (value.trim().length < 2) return setHits([]);
    try {
      const found = await api<MedicineHit[]>(`/medicines?q=${encodeURIComponent(value.trim())}`);
      if (n === seq.current) setHits(found);
    } catch {
      if (n === seq.current) setHits([]);
    }
  }

  async function pick(h: MedicineHit) {
    seq.current++;
    setHits([]);
    setQ(h.name);
    setFailure(null);
    try {
      setResult(await api<Alternatives>(`/medicines/${h.id}/alternatives`));
    } catch (e) {
      setResult(null);
      setFailure(errorMessage(e));
    }
  }

  return (
    <Card className="space-y-4">
      <TextField label="Search the medicine catalogue" value={q} onChange={(e) => search(e.target.value)} autoComplete="off" />
      {hits.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {hits.map((h) => (
            <li key={h.id}>
              <button type="button" onClick={() => pick(h)} className="min-h-[44px] w-full px-3 text-left text-sm hover:bg-mint-100">
                {h.name} {h.strength_text} <span className="text-ink-soft">{h.form}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {failure && <Alert tone="danger" title="Could not load the comparison">{failure}</Alert>}
      {result && (
        <div className="space-y-3" aria-live="polite">
          <Medicine m={result.subject} heading="You chose" />
          {result.status === "insufficient_data" && (
            <Alert tone="info" title="Not enough information to compare">
              This medicine is missing: {result.missing.join(", ")}. We do not guess.
            </Alert>
          )}
          {result.status === "no_candidates" && (
            <EmptyState title="No candidates in this dataset">
              {result.excluded_incomplete > 0
                ? `${result.excluded_incomplete} entries were skipped because their details are incomplete.`
                : "That does not mean none exist."}
            </EmptyState>
          )}
          {result.candidates.map((c) => (
            <Medicine key={c.medicine.id} m={c.medicine} heading="Candidate" />
          ))}
          <p className="text-sm text-ink-soft">{result.notice}</p>
          <p className="text-sm text-ink-soft">{result.price_notice}</p>
        </div>
      )}
    </Card>
  );
}
