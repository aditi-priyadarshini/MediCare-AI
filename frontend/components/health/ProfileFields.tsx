"use client";

import { CheckboxField, SelectField, TextField } from "@/components/ui/primitives";
import type { BloodGroup, Language, ProfileInput } from "@/lib/types";

const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const LANGS: Array<{ value: Language; label: string }> = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी (Hindi)" },
  { value: "or", label: "ଓଡ଼ିଆ (Odia)" },
];

export type Draft = ProfileInput;
type SetDraft = (updater: (d: Draft) => Draft) => void;

export function profileProblems(d: Draft): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.display_name.trim()) e.display_name = "Enter your name.";
  if (d.date_of_birth) {
    const dob = new Date(d.date_of_birth);
    if (Number.isNaN(dob.getTime()) || dob > new Date() || dob.getFullYear() < 1900)
      e.date_of_birth = "Enter a valid date of birth.";
  }
  if (d.height_cm !== null && (d.height_cm < 30 || d.height_cm > 272)) e.height_cm = "Enter height in cm (30–272).";
  if (d.weight_kg !== null && (d.weight_kg < 1 || d.weight_kg > 500)) e.weight_kg = "Enter weight in kg (1–500).";
  return e;
}

const num = (v: string) => (v === "" ? null : Number(v));

export function PersonalFields({
  draft,
  setDraft,
  errors,
}: {
  draft: Draft;
  setDraft: SetDraft;
  errors: Record<string, string>;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <TextField
          label="Full name"
          value={draft.display_name}
          onChange={(e) => setDraft((d) => ({ ...d, display_name: e.target.value }))}
          error={errors.display_name}
          maxLength={120}
        />
      </div>
      <TextField
        label="Date of birth"
        optional
        type="date"
        value={draft.date_of_birth ?? ""}
        onChange={(e) => setDraft((d) => ({ ...d, date_of_birth: e.target.value || null }))}
        error={errors.date_of_birth}
      />
      <SelectField
        label="Blood group"
        optional
        value={draft.blood_group ?? ""}
        onChange={(e) => setDraft((d) => ({ ...d, blood_group: (e.target.value || null) as BloodGroup | null }))}
        options={[{ value: "", label: "Not set" }, ...BLOOD.map((b) => ({ value: b, label: b }))]}
        hint="Saved as patient reported until a clinician confirms it."
      />
      <TextField
        label="Height (cm)"
        optional
        type="number"
        inputMode="decimal"
        step="0.1"
        value={draft.height_cm ?? ""}
        onChange={(e) => setDraft((d) => ({ ...d, height_cm: num(e.target.value) }))}
        error={errors.height_cm}
      />
      <TextField
        label="Weight (kg)"
        optional
        type="number"
        inputMode="decimal"
        step="0.1"
        value={draft.weight_kg ?? ""}
        onChange={(e) => setDraft((d) => ({ ...d, weight_kg: num(e.target.value) }))}
        error={errors.weight_kg}
      />
    </div>
  );
}

export function PreferenceFields({ draft, setDraft }: { draft: Draft; setDraft: SetDraft }) {
  const a = draft.accessibility_preferences;
  const setA = (patch: Partial<typeof a>) =>
    setDraft((d) => ({ ...d, accessibility_preferences: { ...d.accessibility_preferences, ...patch } }));
  return (
    <div className="space-y-5">
      <SelectField
        label="Preferred language"
        value={draft.preferred_language}
        onChange={(e) => setDraft((d) => ({ ...d, preferred_language: e.target.value as Language }))}
        options={LANGS}
        hint="Your choice is saved. Hindi and Odia screens arrive in a later release; English is shown until then."
      />
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-ink">Accessibility</legend>
        <CheckboxField label="Larger text" description="Increases text size across the app." checked={a.large_text} onChange={(e) => setA({ large_text: e.target.checked })} />
        <CheckboxField label="High contrast" description="Stronger borders and text colours." checked={a.high_contrast} onChange={(e) => setA({ high_contrast: e.target.checked })} />
        <CheckboxField label="Reduce motion" description="Turns off animations." checked={a.reduce_motion} onChange={(e) => setA({ reduce_motion: e.target.checked })} />
      </fieldset>
    </div>
  );
}
