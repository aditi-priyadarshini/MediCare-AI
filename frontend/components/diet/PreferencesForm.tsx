"use client";

import { useState } from "react";
import { FormActions } from "@/components/ui/FormPage";
import { LinkButton } from "@/components/ui/LinkButton";
import { Alert, Button, CheckboxField, SelectField, TextField } from "@/components/ui/primitives";
import { api, errorMessage, fieldErrors } from "@/lib/api-client";
import {
  CUISINES,
  DIET_TYPES,
  SITUATIONS,
  foodsProblem,
  splitFoods,
  type Cuisine,
  type DietPreferences,
  type DietType,
  type Situation,
} from "@/lib/diet";

/** Food preferences form. Opens on its own page (/diet/preferences) from the Diet page. */
export function PreferencesForm({
  initial,
  onSaved,
  cancelHref,
}: {
  initial: DietPreferences | null;
  onSaved: (p: DietPreferences) => void;
  cancelHref?: string;
}) {
  const [diet, setDiet] = useState<DietType>(initial?.diet_type ?? "no_restriction");
  const [cuisine, setCuisine] = useState<Cuisine>(initial?.cuisine ?? "general");
  const [meals, setMeals] = useState(String(initial?.meals_per_day ?? 3));
  const [avoid, setAvoid] = useState((initial?.avoid_foods ?? []).join(", "));
  const [situations, setSituations] = useState<Situation[]>(initial?.situations ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const foods = splitFoods(avoid);
    const problem = foodsProblem(foods);
    if (problem) return setErrors({ avoid_foods: problem });
    setErrors({});
    setBusy(true);
    setFailure(null);
    try {
      const next = await api<DietPreferences>("/diet/preferences", {
        method: "PUT",
        body: { diet_type: diet, cuisine, meals_per_day: Number(meals), avoid_foods: foods, situations },
      });
      onSaved(next);
    } catch (err) {
      setErrors(fieldErrors(err));
      setFailure(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const toggle = (s: Situation, on: boolean) =>
    setSituations((cur) => (on ? [...new Set([...cur, s])] : cur.filter((x) => x !== s)));

  return (
    <form onSubmit={submit} className="space-y-5">
      <p className="text-sm text-ink-soft">
        Your recorded allergies are always applied, and your health conditions are always checked for anything that needs a
        clinician. You do not need to repeat them here.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField label="Eating pattern" value={diet} onChange={(e) => setDiet(e.target.value as DietType)} options={DIET_TYPES} />
        <SelectField label="Regional style" value={cuisine} onChange={(e) => setCuisine(e.target.value as Cuisine)} options={CUISINES} />
        <SelectField
          label="Meals a day"
          value={meals}
          onChange={(e) => setMeals(e.target.value)}
          options={[2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
        />
      </div>
      <TextField
        label="Foods to leave out"
        hint="Separate with commas, for example: peanuts, brinjal, milk. We match these against ingredient names."
        value={avoid}
        onChange={(e) => setAvoid(e.target.value)}
        error={errors.avoid_foods}
        optional
      />
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-ink">Does any of this apply?</legend>
        {SITUATIONS.map((s) => (
          <CheckboxField
            key={s.value}
            label={s.label}
            description={s.hint}
            checked={situations.includes(s.value)}
            onChange={(e) => toggle(s.value, e.target.checked)}
          />
        ))}
      </fieldset>
      {failure && (
        <Alert tone="danger" title="Could not save">
          {failure}
        </Alert>
      )}
      <FormActions>
        <Button type="submit" loading={busy}>
          Save preferences
        </Button>
        {cancelHref && (
          <LinkButton href={cancelHref} variant="ghost">
            Cancel
          </LinkButton>
        )}
      </FormActions>
    </form>
  );
}
