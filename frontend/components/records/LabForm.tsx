"use client";

import { useRef, useState } from "react";
import { Alert, Button, StepProgress, TextField } from "@/components/ui";
import { useExperience } from "@/lib/experience";
import {
  emptyLabForm,
  LAB_EDIT_RESETS_NOTICE,
  LAB_STEP_FIELDS,
  labBody,
  labFormFrom,
  labFormProblems,
  todayISO,
  type LabForm as LabFormValues,
} from "@/lib/records";
import { api, errorMessage, fieldErrors } from "@/lib/api-client";
import type { LabResult } from "@/lib/types";

const STEPS = ["Test", "Result", "Date and range"];

/**
 * Add or edit one result. Standard mode shows every field at once. Easy-read shows three short
 * steps (test, result, date and range) and checks each before moving on; typed text is kept when
 * going back. Editing says up front that verification resets (the server does that).
 */
export function LabForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: LabResult | null;
  onSaved: (saved: LabFormValues) => Promise<void> | void;
  onCancel?: () => void;
}) {
  const { experience } = useExperience();
  const easy = experience === "easy";
  const editing = Boolean(initial);
  const [form, setForm] = useState<LabFormValues>(initial ? labFormFrom(initial) : emptyLabForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);

  const set = (k: keyof LabFormValues, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    const next = labFormProblems(form);
    setErrors(next);
    setFailure(null);
    if (Object.keys(next).length) return false;
    setBusy(true);
    try {
      if (initial) await api<LabResult>(`/labs/${initial.id}`, { method: "PATCH", body: labBody(form) });
      else await api<LabResult>("/labs", { method: "POST", body: labBody(form) });
      await onSaved(form);
      if (!initial) setForm({ ...emptyLabForm(), observed_on: form.observed_on });
      setStep(0);
      return true;
    } catch (err) {
      setErrors(fieldErrors(err));
      setFailure(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function next() {
    const problems = labFormProblems(form);
    const here = Object.fromEntries(Object.entries(problems).filter(([k]) => (LAB_STEP_FIELDS[step] as string[]).includes(k)));
    setErrors(here);
    if (Object.keys(here).length) return;
    setStep((s) => s + 1);
    queueMicrotask(() => heading.current?.focus());
  }

  const back = () => {
    setStep((s) => Math.max(0, s - 1));
    queueMicrotask(() => heading.current?.focus());
  };

  const showTest = !easy || step === 0;
  const showResult = !easy || step === 1;
  const showRange = !easy || step === 2;
  const last = !easy || step === STEPS.length - 1;

  return (
    <form
      noValidate
      aria-label={editing ? "Edit lab result" : "Add lab result"}
      onSubmit={(e) => {
        e.preventDefault();
        if (last) void save();
        else next();
      }}
      className="space-y-4"
    >
      {editing && <Alert tone="warning" title="Editing changes the status">{LAB_EDIT_RESETS_NOTICE}</Alert>}
      {easy && (
        <div className="space-y-2">
          <StepProgress steps={STEPS} current={step} />
          <h3 ref={heading} tabIndex={-1} className="text-h3 font-semibold text-navy-900 outline-none">
            Step {step + 1} of {STEPS.length}: {STEPS[step]}
          </h3>
        </div>
      )}
      <div className={easy ? "space-y-4" : "grid gap-4 sm:grid-cols-3"}>
        {showTest && <TextField label="Test" value={form.test_name} onChange={(e) => set("test_name", e.target.value)} error={errors.test_name} maxLength={120} hint="For example: Hemoglobin" />}
        {showResult && (
          <>
            <TextField label="Result" value={form.result} onChange={(e) => set("result", e.target.value)} error={errors.result ?? errors.value_numeric} hint="A number, or words like “Negative”" maxLength={200} />
            <TextField label="Unit" optional value={form.unit} onChange={(e) => set("unit", e.target.value)} error={errors.unit} maxLength={32} hint="Only results in the same unit are compared." />
          </>
        )}
        {showRange && (
          <>
            <TextField label="Report range, low" optional inputMode="decimal" value={form.ref_low} onChange={(e) => set("ref_low", e.target.value)} error={errors.ref_low} />
            <TextField label="Report range, high" optional inputMode="decimal" value={form.ref_high} onChange={(e) => set("ref_high", e.target.value)} error={errors.ref_high} />
            <TextField label="Test date" type="date" max={todayISO()} value={form.observed_on} onChange={(e) => set("observed_on", e.target.value)} error={errors.observed_on} />
          </>
        )}
      </div>
      {failure && <Alert tone="danger">{failure}</Alert>}
      <div className="flex flex-wrap gap-2">
        {easy && step > 0 && (
          <Button type="button" variant="secondary" onClick={back}>
            Back
          </Button>
        )}
        <Button type="submit" loading={busy}>
          {last ? (editing ? "Save changes" : "Save result") : "Next"}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
