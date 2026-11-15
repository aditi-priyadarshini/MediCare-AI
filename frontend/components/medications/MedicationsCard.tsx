"use client";

import { ChevronDown, ChevronUp, Pill, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { MedicationDetails } from "@/components/medications/MedicationDetails";
import {
  Alert,
  Button,
  Card,
  CheckboxField,
  EmptyState,
  SelectField,
  Skeleton,
  TextField,
  VerificationBadge,
} from "@/components/ui/primitives";
import { api, errorMessage, fieldErrors } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { useAsync } from "@/lib/hooks";
import { BASIS_LABEL, FORMS, medicationTitle } from "@/lib/medications";
import { parseNumber, todayISO } from "@/lib/records";
import type { Medication, MedicationBasis, MedicineHit, Page, Prescription } from "@/lib/types";

const BASIS_OPTIONS = [
  { value: "self_reported", label: "I take it myself (including over the counter)" },
  { value: "prescribed", label: "A doctor prescribed it" },
];

const empty = {
  name: "",
  strength: "",
  form: "",
  dose: "",
  units: "1",
  asNeeded: false,
  basis: "self_reported" as MedicationBasis,
  prescriber: "",
  prescribedOn: "",
  reason: "",
  instructions: "",
};

function AddMedication({ onAdded }: { onAdded: () => void }) {
  const [form, setForm] = useState(empty);
  const [medicineId, setMedicineId] = useState<string | null>(null);
  const [hits, setHits] = useState<MedicineHit[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const searchSeq = useRef(0);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function onName(value: string) {
    set("name", value);
    setMedicineId(null);
    const q = value.trim();
    const seq = ++searchSeq.current;
    if (q.length < 2) return setHits([]);
    try {
      const found = await api<MedicineHit[]>(`/medicines?q=${encodeURIComponent(q)}`);
      if (seq === searchSeq.current) setHits(found);
    } catch {
      if (seq === searchSeq.current) setHits([]); // suggestions are optional
    }
  }

  function pick(h: MedicineHit) {
    searchSeq.current++;
    setForm((f) => ({ ...f, name: h.name, strength: h.strength_text ?? f.strength, form: FORMS.some((x) => x.value === h.form) ? (h.form ?? "") : f.form }));
    setMedicineId(h.id);
    setHits([]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.display_name = "Enter the medicine’s name.";
    const units = parseNumber(form.units);
    if (units === null || Number.isNaN(units) || units <= 0) next.units_per_dose = "Enter a number above 0, such as 1.";
    setErrors(next);
    setFailure(null);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      let prescriptionId: string | null = null;
      if (form.basis === "prescribed") {
        const rx = await api<Prescription>("/prescriptions", {
          method: "POST",
          body: { prescriber_name: form.prescriber.trim() || null, prescribed_on: form.prescribedOn || null },
        });
        prescriptionId = rx.id;
      }
      await api<Medication>("/medications", {
        method: "POST",
        body: {
          medicine_id: medicineId,
          prescription_id: prescriptionId,
          display_name: form.name.trim(),
          strength_text: form.strength.trim() || null,
          form: form.form || null,
          dose_text: form.dose.trim() || null,
          units_per_dose: units,
          as_needed: form.asNeeded,
          reason: form.reason.trim() || null,
          instructions: form.instructions.trim() || null,
        },
      });
      setForm(empty);
      setMedicineId(null);
      setHits([]);
      onAdded();
    } catch (err) {
      setErrors(fieldErrors(err));
      setFailure(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card aria-labelledby="add-medication">
      <h2 id="add-medication" className="mb-4 font-semibold text-navy-900">
        Add a medicine
      </h2>
      <form onSubmit={(e) => void submit(e)} noValidate className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <TextField label="Name" value={form.name} onChange={(e) => void onName(e.target.value)} error={errors.display_name} maxLength={120} autoComplete="off" />
          {hits.length > 0 && (
            <ul aria-label="Matching medicines" className="mt-2 divide-y divide-line rounded-lg border border-line">
              {hits.map((h) => (
                <li key={h.id}>
                  <button type="button" onClick={() => pick(h)} className="min-h-[44px] w-full px-3 py-2 text-left text-sm hover:bg-mint-100">
                    {[h.name, h.form, h.strength_text].filter(Boolean).join(" · ")}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {medicineId && <p className="mt-1 text-xs text-ink-soft">Matched to our medicine list. Check it against your pack.</p>}
        </div>
        <TextField label="Strength" optional value={form.strength} onChange={(e) => set("strength", e.target.value)} maxLength={64} hint="As printed, for example 500 mg" />
        <SelectField label="Form" value={form.form} onChange={(e) => set("form", e.target.value)} options={FORMS} />
        <TextField label="Dose" optional value={form.dose} onChange={(e) => set("dose", e.target.value)} maxLength={120} hint="Copy it from the label or prescription" error={errors.dose_text} />
        <TextField
          label="How many tablets, ml or puffs per dose"
          inputMode="decimal"
          value={form.units}
          onChange={(e) => set("units", e.target.value)}
          error={errors.units_per_dose}
          hint="Used to work out how long your supply lasts"
        />
        <div className="sm:col-span-2">
          <SelectField label="How did you start it" value={form.basis} onChange={(e) => set("basis", e.target.value as MedicationBasis)} options={BASIS_OPTIONS} />
        </div>
        {form.basis === "prescribed" && (
          <>
            <TextField label="Prescribed by" optional value={form.prescriber} onChange={(e) => set("prescriber", e.target.value)} maxLength={200} />
            <TextField label="Prescribed on" optional type="date" max={todayISO()} value={form.prescribedOn} onChange={(e) => set("prescribedOn", e.target.value)} error={errors.prescribed_on} />
          </>
        )}
        <div className="sm:col-span-2">
          <CheckboxField label="Only when needed" description="For example a painkiller you take if you have a headache. No fixed times." checked={form.asNeeded} onChange={(e) => set("asNeeded", e.target.checked)} />
        </div>
        <TextField label="What it’s for" optional value={form.reason} onChange={(e) => set("reason", e.target.value)} maxLength={500} />
        <TextField label="Instructions" optional value={form.instructions} onChange={(e) => set("instructions", e.target.value)} maxLength={1000} hint="For example: after food" />
        {failure && (
          <div className="sm:col-span-2">
            <Alert tone="danger">{failure}</Alert>
          </div>
        )}
        <div className="sm:col-span-2">
          <Button type="submit" loading={busy}>
            <Plus className="h-4 w-4" aria-hidden /> Save medicine
          </Button>
        </div>
      </form>
      <p className="mt-3 text-xs text-ink-soft">
        MediCare AI keeps track of what you tell it. It doesn’t check doses or interactions, so follow your doctor’s and
        pharmacist’s advice.
      </p>
    </Card>
  );
}

function MedicationRow({ med, onChange }: { med: Medication; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function setStatus(status: Medication["status"]) {
    setBusy(true);
    setError(null);
    try {
      await api<Medication>(`/medications/${med.id}`, { method: "PATCH", body: { status } });
      onChange();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="space-y-3 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium text-ink">
            <Pill className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
            <span className="break-words">{medicationTitle(med)}</span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
            <span className={cn("rounded-full px-2 py-0.5 font-medium", med.basis === "prescribed" ? "bg-info-100 text-info-700" : "bg-mint-100 text-teal-700")}>{BASIS_LABEL[med.basis]}</span>
            {med.status === "paused" && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-600">Paused</span>}
            {med.as_needed && <span>Only when needed</span>}
            {med.dose_text && <span>{med.dose_text}</span>}
            {med.reason && <span>For {med.reason}</span>}
            <VerificationBadge status={med.verification_status} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {med.status === "active" ? (
            <Button variant="secondary" disabled={busy} onClick={() => void setStatus("paused")}>
              Pause
            </Button>
          ) : (
            <Button variant="secondary" disabled={busy} onClick={() => void setStatus("active")}>
              Resume
            </Button>
          )}
          <Button variant="ghost" disabled={busy} onClick={() => void setStatus("stopped")}>
            Stop
          </Button>
          <Button variant="ghost" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
            Schedule and supply
          </Button>
        </div>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {open && <MedicationDetails med={med} onChange={onChange} />}
    </li>
  );
}

export function MedicationsCard({ version, onChange }: { version: number; onChange: () => void }) {
  const list = useAsync(() => api<Page<Medication>>("/medications?limit=100"), [version]);
  return (
    <div className="space-y-6">
      <Card aria-labelledby="your-medications">
        <h2 id="your-medications" className="mb-4 font-semibold text-navy-900">
          Your medicines
        </h2>
        {list.error ? (
          <Alert tone="danger">{errorMessage(list.error)}</Alert>
        ) : list.loading && !list.data ? (
          <Skeleton className="h-20 w-full" />
        ) : list.data && list.data.items.length > 0 ? (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {list.data.items.map((m) => (
              <MedicationRow key={m.id} med={m} onChange={onChange} />
            ))}
          </ul>
        ) : (
          <EmptyState title="No medicines yet">Add one below to set up reminders.</EmptyState>
        )}
      </Card>
      <AddMedication onAdded={onChange} />
    </div>
  );
}
