"use client";

import { useRef, useState } from "react";
import { ScheduleFields } from "@/components/medications/ScheduleFields";
import { Drawer } from "@/components/ui/Drawer";
import { StepProgress } from "@/components/ui/StepProgress";
import { useToast } from "@/components/ui/Toast";
import { Alert, Button, CheckboxField, SelectField, TextField } from "@/components/ui/primitives";
import { api, errorMessage, fieldErrors } from "@/lib/api-client";
import { defaultScheduleDraft, FORMS, scheduleDraftToBody } from "@/lib/medications";
import { useProfile } from "@/lib/profile-context";
import { parseNumber, todayISO } from "@/lib/records";
import type { Medication, MedicationBasis, MedicineHit, Prescription, Schedule } from "@/lib/types";

const STEPS = ["Medicine", "Source", "Dose", "Reminders"];

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

/**
 * Add a medicine in four short steps: which medicine (search the catalogue or type it), where it
 * came from (prescribed or self-reported), how much, and optionally when. Typed text is kept when
 * going back. The calls are the same as before: POST /prescriptions (only if prescribed), POST
 * /medications, then POST /medications/{id}/schedules if reminders were set up.
 */
export function AddMedicationFlow({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  return (
    <Drawer open={open} onClose={onClose} title="Add a medicine" closeLabel="Close add medicine" className="sm:w-[30rem]">
      <Flow onClose={onClose} onAdded={onAdded} />
    </Drawer>
  );
}

function Flow({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const { profile } = useProfile();
  const { show } = useToast();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(empty);
  const [medicineId, setMedicineId] = useState<string | null>(null);
  const [hits, setHits] = useState<MedicineHit[]>([]);
  const [remind, setRemind] = useState(true);
  const [schedule, setSchedule] = useState(() => defaultScheduleDraft(todayISO()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const searchSeq = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
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

  const unitsValue = parseNumber(form.units);
  const stepProblems = (s: number): Record<string, string> => {
    const e: Record<string, string> = {};
    if (s === 0 && !form.name.trim()) e.display_name = "Enter the medicine’s name.";
    if (s === 2 && (unitsValue === null || Number.isNaN(unitsValue) || unitsValue <= 0)) e.units_per_dose = "Enter a number above 0, such as 1.";
    return e;
  };

  function go(to: number) {
    setStep(to);
    setErrors({});
    queueMicrotask(() => heading.current?.focus());
  }

  function next() {
    const e = stepProblems(step);
    setErrors(e);
    if (Object.keys(e).length) return;
    // As-needed medicines have no fixed times, so the reminders step is skipped for them.
    if (step === 2 && form.asNeeded) return void submit();
    go(step + 1);
  }

  async function submit() {
    const scheduleWanted = remind && !form.asNeeded && step === 3;
    const checked = scheduleWanted ? scheduleDraftToBody(schedule) : { errors: {}, body: null };
    setErrors(checked.errors);
    setFailure(null);
    if (scheduleWanted && !checked.body) return;

    setBusy(true);
    let med: Medication;
    try {
      let prescriptionId: string | null = null;
      if (form.basis === "prescribed") {
        const rx = await api<Prescription>("/prescriptions", {
          method: "POST",
          body: { prescriber_name: form.prescriber.trim() || null, prescribed_on: form.prescribedOn || null },
        });
        prescriptionId = rx.id;
      }
      med = await api<Medication>("/medications", {
        method: "POST",
        body: {
          medicine_id: medicineId,
          prescription_id: prescriptionId,
          display_name: form.name.trim(),
          strength_text: form.strength.trim() || null,
          form: form.form || null,
          dose_text: form.dose.trim() || null,
          units_per_dose: unitsValue,
          as_needed: form.asNeeded,
          reason: form.reason.trim() || null,
          instructions: form.instructions.trim() || null,
        },
      });
    } catch (err) {
      setErrors(fieldErrors(err));
      setFailure(errorMessage(err));
      setBusy(false);
      return;
    }
    // The medicine exists from here on; a schedule failure must not look like nothing was saved.
    let scheduleError: string | null = null;
    if (checked.body) {
      try {
        await api<Schedule>(`/medications/${med.id}/schedules`, { method: "POST", body: checked.body });
      } catch (err) {
        scheduleError = errorMessage(err);
      }
    }
    setBusy(false);
    onAdded();
    onClose();
    if (scheduleError) show(`The medicine was saved, but its schedule wasn’t: ${scheduleError} Add it from the medicine’s details.`, "danger");
    else show(checked.body ? "Medicine and schedule saved." : "Medicine saved.", "success");
  }

  const lastStep = step === 3;
  return (
    <form
      noValidate
      aria-label="Add a medicine"
      onSubmit={(e) => {
        e.preventDefault();
        if (lastStep) void submit();
        else next();
      }}
      className="space-y-5"
    >
      <StepProgress steps={STEPS} current={step} />
      <h3 ref={heading} tabIndex={-1} className="text-h3 font-semibold text-navy-900 outline-none">
        Step {step + 1} of {STEPS.length}: {STEPS[step]}
      </h3>

      {step === 0 && (
        <div className="space-y-4">
          <div>
            <TextField label="Name" value={form.name} onChange={(e) => void onName(e.target.value)} error={errors.display_name} maxLength={120} autoComplete="off" hint="Start typing to search our medicine list, or enter it yourself." />
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
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <SelectField label="How did you start it" value={form.basis} onChange={(e) => set("basis", e.target.value as MedicationBasis)} options={BASIS_OPTIONS} />
          {form.basis === "prescribed" ? (
            <>
              <TextField label="Prescribed by" optional value={form.prescriber} onChange={(e) => set("prescriber", e.target.value)} maxLength={200} />
              <TextField label="Prescribed on" optional type="date" max={todayISO()} value={form.prescribedOn} onChange={(e) => set("prescribedOn", e.target.value)} error={errors.prescribed_on} />
            </>
          ) : (
            <p className="text-sm text-ink-soft">It will be listed as self-reported. You can still add a schedule and supply.</p>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <TextField label="Dose" optional value={form.dose} onChange={(e) => set("dose", e.target.value)} maxLength={120} hint="Copy it from the label or prescription" error={errors.dose_text} />
          <TextField label="How many tablets, ml or puffs per dose" inputMode="decimal" value={form.units} onChange={(e) => set("units", e.target.value)} error={errors.units_per_dose} hint="Used to work out how long your supply lasts" />
          <CheckboxField label="Only when needed" description="For example a painkiller you take if you have a headache. No fixed times, so there is no reminder step." checked={form.asNeeded} onChange={(e) => set("asNeeded", e.target.checked)} />
          <TextField label="What it’s for" optional value={form.reason} onChange={(e) => set("reason", e.target.value)} maxLength={500} />
          <TextField label="Instructions" optional value={form.instructions} onChange={(e) => set("instructions", e.target.value)} maxLength={1000} hint="For example: after food" />
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <CheckboxField label="Set up reminder times now" description="You can also do this later from the medicine’s details." checked={remind} onChange={(e) => setRemind(e.target.checked)} />
          {remind && <ScheduleFields draft={schedule} setDraft={setSchedule} errors={errors} timezone={profile.timezone} />}
          <p className="text-xs text-ink-soft">A reminder only tells you a dose is due. A dose is marked taken only when you say so.</p>
        </div>
      )}

      {failure && <Alert tone="danger">{failure}</Alert>}

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        {step > 0 && (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => go(step - 1)}>
            Back
          </Button>
        )}
        <Button type="submit" loading={busy}>
          {lastStep || (step === 2 && form.asNeeded) ? "Save medicine" : "Next"}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
      </div>
      <p className="text-xs text-ink-soft">
        MediCare AI keeps track of what you tell it. It doesn’t check doses or interactions, so follow your doctor’s and pharmacist’s advice.
      </p>
    </form>
  );
}
