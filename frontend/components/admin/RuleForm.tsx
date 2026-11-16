"use client";

import { useState } from "react";
import { Alert, Button, SelectField, TextField } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import {
  RULE_KIND_LABEL,
  SEVERITIES,
  type AdminIngredient,
  type AdminRule,
  type AdminSource,
  type RuleKind,
  type Severity,
} from "@/lib/admin";

interface Props {
  ingredients: AdminIngredient[];
  sources: AdminSource[];
  /** When set, the form creates a new version of this active rule (its kind is fixed). */
  replacing?: AdminRule;
  onSaved: () => void;
  onCancel: () => void;
}

const area = "min-h-[72px] w-full rounded-lg border border-line bg-surface px-3 py-2 text-base";

export function RuleForm({ ingredients, sources, replacing, onSaved, onCancel }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [kind, setKind] = useState<RuleKind>(replacing?.kind ?? "drug_drug");
  const [ingredient, setIngredient] = useState(replacing?.ingredient_id ?? "");
  const [counterpart, setCounterpart] = useState(replacing?.counterpart_ingredient_id ?? "");
  const [term, setTerm] = useState(replacing?.counterpart_term ?? "");
  const [severity, setSeverity] = useState<Severity>(replacing?.severity ?? "moderate");
  const [description, setDescription] = useState(replacing?.description ?? "");
  const [significance, setSignificance] = useState(replacing?.clinical_significance ?? "");
  const [guidance, setGuidance] = useState(replacing?.guidance ?? "");
  const [sourceId, setSourceId] = useState(replacing?.source_id ?? sources[0]?.id ?? "");
  const [sourceVersion, setSourceVersion] = useState(replacing?.source_version ?? sources[0]?.version ?? "");
  const [reviewedAt, setReviewedAt] = useState(today);
  const [jurisdiction, setJurisdiction] = useState(replacing?.jurisdiction ?? "IN");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const ingOptions = [{ value: "", label: "Choose…" }, ...ingredients.map((i) => ({ value: i.id, label: i.name }))];
  const ready =
    ingredient &&
    sourceId &&
    description.trim().length >= 5 &&
    (kind === "drug_drug" ? counterpart && counterpart !== ingredient : term.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFailure(null);
    const body = {
      kind,
      ingredient_id: ingredient,
      counterpart_ingredient_id: kind === "drug_drug" ? counterpart : null,
      counterpart_term: kind === "drug_drug" ? null : term.trim(),
      severity,
      description: description.trim(),
      clinical_significance: significance.trim() || null,
      guidance: guidance.trim() || null,
      source_id: sourceId,
      source_version: sourceVersion.trim(),
      reviewed_at: reviewedAt,
      jurisdiction: jurisdiction.trim(),
    };
    try {
      await api(replacing ? `/admin/safety-rules/${replacing.id}/supersede` : "/admin/safety-rules", {
        method: "POST",
        body,
      });
      onSaved();
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4 rounded-lg border border-line p-4">
      <h3 className="text-base font-semibold text-ink">{replacing ? "Write a new version of this rule" : "Add a rule"}</h3>
      {replacing && (
        <Alert tone="info" title="Nothing is overwritten">
          The current version is kept and marked as replaced. The new version starts without a second-person review.
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Kind of rule"
          value={kind}
          disabled={Boolean(replacing)}
          options={(Object.keys(RULE_KIND_LABEL) as RuleKind[]).map((k) => ({ value: k, label: RULE_KIND_LABEL[k] }))}
          onChange={(e) => setKind(e.target.value as RuleKind)}
        />
        <SelectField
          label="Severity"
          value={severity}
          options={SEVERITIES.map((s) => ({ value: s, label: s }))}
          onChange={(e) => setSeverity(e.target.value as Severity)}
        />
        <SelectField label="Active ingredient" value={ingredient} options={ingOptions} onChange={(e) => setIngredient(e.target.value)} />
        {kind === "drug_drug" ? (
          <SelectField label="Second ingredient" value={counterpart} options={ingOptions} onChange={(e) => setCounterpart(e.target.value)} />
        ) : (
          <TextField
            label={kind === "drug_food" ? "Food or drink" : "Condition"}
            value={term}
            maxLength={80}
            onChange={(e) => setTerm(e.target.value)}
          />
        )}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="rule-desc" className="block text-sm font-medium text-ink">What the source says</label>
        <textarea id="rule-desc" className={area} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="rule-sig" className="block text-sm font-medium text-ink">Clinical significance <span className="font-normal text-ink-soft">(optional)</span></label>
          <textarea id="rule-sig" className={area} maxLength={1000} value={significance} onChange={(e) => setSignificance(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="rule-guid" className="block text-sm font-medium text-ink">Wording shown to patients <span className="font-normal text-ink-soft">(optional)</span></label>
          <textarea id="rule-guid" className={area} maxLength={1000} value={guidance} onChange={(e) => setGuidance(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Source"
          value={sourceId}
          options={sources.map((s) => ({ value: s.id, label: `${s.name} (${s.version})` }))}
          onChange={(e) => {
            setSourceId(e.target.value);
            setSourceVersion(sources.find((s) => s.id === e.target.value)?.version ?? "");
          }}
        />
        <TextField label="Source version" value={sourceVersion} maxLength={32} onChange={(e) => setSourceVersion(e.target.value)} />
        <TextField label="Date the source was reviewed" type="date" max={today} value={reviewedAt} onChange={(e) => setReviewedAt(e.target.value)} />
        <TextField label="Jurisdiction" value={jurisdiction} maxLength={16} onChange={(e) => setJurisdiction(e.target.value)} />
      </div>
      {failure && (
        <Alert tone="danger" title="Not saved">
          {failure}
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy} disabled={!ready}>
          {replacing ? "Save new version" : "Add rule"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
