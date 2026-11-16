"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Card, CheckboxField, PageLoading, SelectField, TextField } from "@/components/ui/primitives";
import { api, errorMessage, fieldErrors } from "@/lib/api-client";
import {
  CUISINES,
  DIET_TYPES,
  FLAG_TONE,
  SITUATIONS,
  blocked,
  foodsProblem,
  splitFoods,
  visibleFlags,
  type Cuisine,
  type DietPreferences,
  type DietType,
  type Situation,
} from "@/lib/diet";
import { useAsync } from "@/lib/hooks";

export function PreferencesCard({ onSaved }: { onSaved: (p: DietPreferences) => void }) {
  const loaded = useAsync(() => api<DietPreferences>("/diet/preferences"), []);
  const [diet, setDiet] = useState<DietType>("no_restriction");
  const [cuisine, setCuisine] = useState<Cuisine>("general");
  const [meals, setMeals] = useState("3");
  const [avoid, setAvoid] = useState("");
  const [situations, setSituations] = useState<Situation[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<DietPreferences | null>(null);

  useEffect(() => {
    const p = loaded.data;
    if (!p) return;
    setDiet(p.diet_type);
    setCuisine(p.cuisine);
    setMeals(String(p.meals_per_day));
    setAvoid(p.avoid_foods.join(", "));
    setSituations(p.situations);
    setSaved(p);
    onSaved(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded.data]);

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
      setSaved(next);
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

  if (loaded.loading && !loaded.data) return <PageLoading label="Loading your preferences" />;

  const stop = saved ? blocked(saved.review_flags) : undefined;
  return (
    <Card aria-labelledby="pref-h" className="space-y-4">
      <div>
        <h2 id="pref-h" className="text-lg font-semibold text-ink">
          Your food preferences
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Your recorded allergies are always applied, and your health conditions are always checked for anything that
          needs a clinician. You do not need to repeat them here.
        </p>
      </div>
      {loaded.error != null && <Alert tone="danger" title="Could not load">{errorMessage(loaded.error)}</Alert>}
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
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
        {failure && <Alert tone="danger" title="Could not save">{failure}</Alert>}
        <Button type="submit" loading={busy}>
          Save preferences
        </Button>
      </form>
      {saved && (
        <div className="space-y-2" aria-live="polite">
          {stop && (
            <Alert tone="danger" title="No meal plan can be made">
              {stop.message}
            </Alert>
          )}
          {visibleFlags(saved.review_flags)
            .filter((f) => f.severity !== "block")
            .map((f) => (
              <Alert key={f.code} tone={FLAG_TONE[f.severity]}>
                {f.message}
              </Alert>
            ))}
        </div>
      )}
    </Card>
  );
}
