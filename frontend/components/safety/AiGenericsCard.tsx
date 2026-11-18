"use client";

import { useState } from "react";
import { Alert, Button, Card, TextField } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { ESTIMATE_LABEL, estimateLine, priceAge, priceLine } from "@/lib/safety";
import type { AiAlternatives, AltProduct, MedicineAlternatives } from "@/lib/types";

function Estimate({ p }: { p: NonNullable<AltProduct["price"]> }) {
  return (
    <p className="text-ink">
      <span className="mr-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-600">
        {ESTIMATE_LABEL}
      </span>
      {estimateLine(p)}
    </p>
  );
}

function Product({ p }: { p: AltProduct }) {
  return (
    <li className="space-y-1 rounded-lg border border-line p-3 text-sm">
      <p className="font-semibold text-ink">
        {p.name}
        <span
          className={cn(
            "ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold",
            p.kind === "generic" ? "bg-mint-100 text-teal-700" : "bg-info-100 text-info-700",
          )}
        >
          {p.kind === "generic" ? "Generic" : "Brand"}
        </span>
      </p>
      <p className="text-ink-soft">{[p.strength, p.form].filter(Boolean).join(" · ") || "Strength and form not stated"}</p>
      {p.price ? <Estimate p={p.price} /> : <p className="text-xs text-ink-soft">No price estimate.</p>}
      {p.differences.length > 0 && <p className="text-xs text-ink-soft">{p.differences.join(". ")}. Ask a pharmacist to confirm.</p>}
    </li>
  );
}

function MedicineBlock({ m }: { m: MedicineAlternatives }) {
  const catalogue = m.reference && m.reference.candidates.length > 0 ? m.reference : null;
  return (
    <div className="space-y-3 rounded-lg border border-line p-4">
      <div>
        <p className="font-semibold text-ink">
          {m.name}
          {m.strength ? ` ${m.strength}` : ""}
        </p>
        {m.generic_name && (
          <p className="text-sm text-ink-soft">
            {m.is_brand === false ? "Already sold under its generic name: " : "Generic name: "}
            {m.generic_name}
          </p>
        )}
        {m.own_price && <Estimate p={m.own_price} />}
      </div>

      {m.status === "not_recognised" && (
        <Alert tone="info" title="Not recognised">
          The AI did not recognise this medicine, so nothing was suggested. Ask a pharmacist.
        </Alert>
      )}
      {m.status === "none_found" && (
        <p className="text-sm text-ink-soft">
          No other product with exactly the same ingredients, strength and form was found. That does not mean none exist.
        </p>
      )}
      {m.alternatives.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase text-ink-soft">Same ingredients, strength and form (AI)</h4>
          <ul className="space-y-2">
            {m.alternatives.map((p) => (
              <Product key={p.name} p={p} />
            ))}
          </ul>
        </div>
      )}
      {catalogue && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase text-ink-soft">From the reference catalogue</h4>
          <ul className="space-y-2">
            {catalogue.candidates.map((c) => (
              <li key={c.medicine.id} className="rounded-lg border border-line p-3 text-sm">
                <p className="font-semibold text-ink">
                  {c.medicine.name} {c.medicine.strength_text}
                </p>
                {c.medicine.prices.length > 0 ? (
                  c.medicine.prices.map((p) => (
                    <p key={`${p.source_name}-${p.observed_at}`}>
                      {priceLine(p)}
                      <span className="block text-xs text-ink-soft">
                        {p.source_name} · {p.jurisdiction}. {priceAge(p)}
                      </span>
                    </p>
                  ))
                ) : (
                  <p className="text-xs text-ink-soft">No sourced price on record.</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Finds other products with the same ingredients, strength and form for each medicine (or one typed
 * name), with rough price estimates. AI prices are labelled as estimates and shown apart from
 * sourced catalogue prices. Candidates are for a pharmacist conversation, never a substitution.
 */
export function AiGenericsCard() {
  const [name, setName] = useState("");
  const [strength, setStrength] = useState("");
  const [result, setResult] = useState<AiAlternatives | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setFailure(null);
    const n = name.trim();
    const s = strength.trim();
    try {
      setResult(
        await api<AiAlternatives>("/safety/ai-alternatives", {
          method: "POST",
          body: n ? { medicine_name: n, ...(s ? { strength: s } : {}) } : {},
        }),
      );
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const warn = result && ["consent_required", "ai_unavailable", "partial", "none"].includes(result.mode);

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Find generics and prices with AI</h2>
        <p className="text-sm text-ink-soft">
          Looks up other products with the same ingredients for each medicine you take, or for one you type. Only medicine
          names are sent, and only if you allowed AI use in Settings.
        </p>
      </div>
      <TextField
        label="A single medicine (optional)"
        hint="Leave blank to check everything on your list"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        autoComplete="off"
      />
      {name.trim() && (
        <TextField label="Strength (optional)" hint="For example 500 mg" value={strength} onChange={(e) => setStrength(e.target.value)} maxLength={40} autoComplete="off" />
      )}
      <Button onClick={run} loading={busy}>
        {result ? "Look up again" : name.trim() ? "Look up this medicine" : "Look up my medicines"}
      </Button>

      {failure && (
        <Alert tone="danger" title="The lookup did not run">
          {failure}
        </Alert>
      )}
      {result && (
        <div className="space-y-3" aria-live="polite">
          <Alert tone={warn ? "warning" : "info"} title={warn ? "Please note" : result.ai_label}>
            {result.message}
          </Alert>
          {result.medicines.map((m) => (
            <MedicineBlock key={m.medication_id ?? m.name} m={m} />
          ))}
          <p className="text-sm text-ink-soft">{result.notice}</p>
          <p className="text-sm text-ink-soft">{result.price_notice}</p>
          <p className="text-xs text-ink-soft">{result.ai_label}</p>
        </div>
      )}
    </Card>
  );
}
