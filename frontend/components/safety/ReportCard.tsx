"use client";

import { useState } from "react";
import { Alert, Button, Card, EmptyState, SelectField, TextField } from "@/components/ui/primitives";
import { api, errorMessage, fieldErrors } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks";
import { todayISO } from "@/lib/records";
import type { AdverseEvent, Medication, Page } from "@/lib/types";

const SEVERITY = [
  { value: "mild", label: "Mild" },
  { value: "moderate", label: "Moderate" },
  { value: "severe", label: "Severe" },
];
const OUTCOME = [
  { value: "unknown", label: "Not sure" },
  { value: "ongoing", label: "Still happening" },
  { value: "recovered", label: "Gone" },
];

export function ReportCard() {
  const [version, setVersion] = useState(0);
  const reports = useAsync(() => api<Page<AdverseEvent>>("/adverse-events?limit=50"), [version]);
  const meds = useAsync(() => api<Page<Medication>>("/medications?limit=100"), []);
  const [medId, setMedId] = useState("");
  const [name, setName] = useState("");
  const [reaction, setReaction] = useState("");
  const [onset, setOnset] = useState("");
  const [severity, setSeverity] = useState("mild");
  const [outcome, setOutcome] = useState("unknown");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!medId && !name.trim()) next.medication_name = "Say which medicine this was about.";
    if (reaction.trim().length < 3) next.reaction = "Describe what you noticed.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setFailure(null);
    try {
      await api("/adverse-events", {
        method: "POST",
        body: {
          medication_id: medId || undefined,
          medication_name: medId ? undefined : name.trim(),
          reaction: reaction.trim(),
          onset_date: onset || undefined,
          severity,
          outcome,
        },
      });
      setReaction("");
      setName("");
      setOnset("");
      setVersion((v) => v + 1);
    } catch (err) {
      setErrors(fieldErrors(err));
      setFailure(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/adverse-events/${id}`, { method: "DELETE" });
      setVersion((v) => v + 1);
    } catch (err) {
      setFailure(errorMessage(err));
    }
  }

  const options = [
    { value: "", label: "Another medicine (type the name)" },
    ...(meds.data?.items ?? []).map((m) => ({ value: m.id, label: m.display_name })),
  ];

  return (
    <Card aria-labelledby="adr-h" className="space-y-4">
      <div>
        <h2 id="adr-h" className="text-lg font-semibold text-ink">
          Note a possible side effect
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          This keeps a private record of what you noticed. It does not show that a medicine caused it, and nothing is
          sent to a doctor or regulator. If you feel very unwell, get medical help now.
        </p>
      </div>
      <form onSubmit={submit} noValidate className="space-y-3">
        <SelectField label="Medicine" value={medId} onChange={(e) => setMedId(e.target.value)} options={options} />
        {!medId && (
          <TextField label="Medicine name" value={name} onChange={(e) => setName(e.target.value)} error={errors.medication_name} maxLength={120} />
        )}
        <TextField label="What did you notice?" value={reaction} onChange={(e) => setReaction(e.target.value)} error={errors.reaction} maxLength={2000} />
        <TextField label="When did it start?" type="date" max={todayISO()} value={onset} onChange={(e) => setOnset(e.target.value)} error={errors.onset_date} optional />
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="How bad was it?" value={severity} onChange={(e) => setSeverity(e.target.value)} options={SEVERITY} />
          <SelectField label="Is it still happening?" value={outcome} onChange={(e) => setOutcome(e.target.value)} options={OUTCOME} />
        </div>
        {failure && <Alert tone="danger" title="Not saved">{failure}</Alert>}
        <Button type="submit" loading={busy}>
          Save note
        </Button>
      </form>
      {reports.data && reports.data.items.length === 0 && <EmptyState title="No notes yet" />}
      <ul className="space-y-2">
        {reports.data?.items.map((r) => (
          <li key={r.id} className="flex items-start justify-between gap-3 rounded-lg border border-line p-3 text-sm">
            <div>
              <p className="font-semibold text-ink">{r.medication_name}</p>
              <p className="text-ink">{r.reaction}</p>
              <p className="text-xs text-ink-soft">
                {r.severity} · {r.outcome === "unknown" ? "outcome not known" : r.outcome}
                {r.onset_date ? ` · started ${r.onset_date}` : ""}
              </p>
            </div>
            <Button variant="ghost" onClick={() => remove(r.id)} aria-label={`Remove note about ${r.medication_name}`}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
