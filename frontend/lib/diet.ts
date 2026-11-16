/** Diet preferences and plans: types and small pure helpers. */

export type DietType = "no_restriction" | "vegetarian" | "eggetarian" | "pescatarian" | "vegan" | "jain";
export type Cuisine = "general" | "north_indian" | "south_indian" | "east_indian" | "western_indian";
export type Situation =
  | "pregnant_or_breastfeeding"
  | "kidney_disease"
  | "eating_disorder_history"
  | "child_under_12"
  | "clinician_diet";

export interface DietFlag {
  code: string;
  severity: "block" | "review" | "info";
  message: string;
}

export interface DietPreferences {
  diet_type: DietType;
  cuisine: Cuisine;
  meals_per_day: number;
  avoid_foods: string[];
  situations: Situation[];
  saved: boolean;
  review_flags: DietFlag[];
  notice: string;
  updated_at: string | null;
}

export interface PlanMeal {
  slot: "breakfast" | "lunch" | "snack" | "dinner";
  idea_id: string | null;
  name: string | null;
  description: string;
  ingredients: string[];
}

export interface DietPlan {
  id: string;
  title: string;
  created_at: string;
  catalogue_version: string;
  constraints_used: {
    diet_type: string;
    cuisine: string;
    meals_per_day: number;
    avoid_foods: string[];
    allergies_applied: string[];
    allergies_not_matched: string[];
    avoid_not_matched: string[];
    ideas_available: number;
  };
  review_flags: DietFlag[];
  days: { day: number; meals: PlanMeal[] }[];
  limitations: string[];
  notice: string;
}

export interface DietPlanSummary {
  id: string;
  title: string;
  created_at: string;
  catalogue_version: string;
}

export const DIET_TYPES: { value: DietType; label: string }[] = [
  { value: "no_restriction", label: "No restriction" },
  { value: "vegetarian", label: "Vegetarian (no egg, fish or meat)" },
  { value: "eggetarian", label: "Eggetarian (egg, no fish or meat)" },
  { value: "pescatarian", label: "Pescatarian (fish, no meat)" },
  { value: "vegan", label: "Vegan (no animal products)" },
  { value: "jain", label: "Jain (no roots, onion, garlic or animal products)" },
];

export const CUISINES: { value: Cuisine; label: string }[] = [
  { value: "general", label: "No preference" },
  { value: "north_indian", label: "North Indian" },
  { value: "south_indian", label: "South Indian" },
  { value: "east_indian", label: "East Indian (including Odia)" },
  { value: "western_indian", label: "Western Indian" },
];

export const SITUATIONS: { value: Situation; label: string; hint: string }[] = [
  { value: "pregnant_or_breastfeeding", label: "Pregnant or breastfeeding", hint: "Ideas are shown with a note to check them." },
  { value: "clinician_diet", label: "A clinician gave me a special diet", hint: "These ideas are not adjusted to it." },
  { value: "kidney_disease", label: "Kidney disease", hint: "No plan is made. Your care team sets this diet." },
  { value: "eating_disorder_history", label: "History of an eating disorder", hint: "No plan is made. Please see your clinician or dietitian." },
  { value: "child_under_12", label: "This is for a child under 12", hint: "No plan is made. A child's diet needs a paediatrician or dietitian." },
];

export const SLOT_LABEL: Record<PlanMeal["slot"], string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  snack: "Snack",
  dinner: "Dinner",
};

/** Split "peanuts, brinjal\nmilk" into trimmed, lower-case, de-duplicated foods. */
export function splitFoods(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(/[,\n;]/)) {
    const item = part.replace(/\s+/g, " ").trim().toLowerCase();
    if (item && !out.includes(item)) out.push(item);
  }
  return out;
}

/** Client-side check mirroring the API limits (20 foods, 40 characters each). */
export function foodsProblem(foods: string[]): string | null {
  if (foods.length > 20) return "List at most 20 foods.";
  if (foods.some((f) => f.length > 40)) return "Keep each food to 40 characters or fewer.";
  return null;
}

export const FLAG_TONE: Record<DietFlag["severity"], "danger" | "warning" | "info"> = {
  block: "danger",
  review: "warning",
  info: "info",
};

/** Flags to show above a plan: the general-education note is the page's own notice, not a flag. */
export function visibleFlags(flags: DietFlag[]): DietFlag[] {
  return flags.filter((f) => f.code !== "general_education");
}

export function blocked(flags: DietFlag[]): DietFlag | undefined {
  return flags.find((f) => f.severity === "block");
}
