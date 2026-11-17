"use client";

import { Cookie, Moon, Sun, Sunrise, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import {
  FLAG_TONE,
  SLOT_LABEL,
  planDayLabel,
  planDayNumber,
  visibleFlags,
  type DietPlan,
  type PlanMeal,
} from "@/lib/diet";

const SLOT_ICON: Record<PlanMeal["slot"], LucideIcon> = {
  breakfast: Sunrise,
  lunch: Sun,
  snack: Cookie,
  dinner: Moon,
};

function MealCard({ meal }: { meal: PlanMeal }) {
  const Icon = SLOT_ICON[meal.slot];
  return (
    <article
      className={cn(
        "flex h-full flex-col gap-3 rounded-card border p-5 shadow-sm",
        meal.name ? "border-line bg-surface" : "border-dashed border-line bg-canvas",
      )}
    >
      <header className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-mint-100 text-teal-700">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        {SLOT_LABEL[meal.slot]}
      </header>
      {meal.name ? (
        <>
          <h3 className="text-lg font-semibold leading-snug text-navy-900">{meal.name}</h3>
          <p className="text-sm text-ink-soft">{meal.description}</p>
          {meal.ingredients.length > 0 && (
            <div className="mt-auto">
              <p className="mb-1 text-xs font-medium text-ink-soft">Contains</p>
              <ul className="flex flex-wrap gap-1.5">
                {meal.ingredients.map((i) => (
                  <li key={i} className="rounded-full bg-mint-100 px-2 py-0.5 text-xs text-teal-700">
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-ink-soft">{meal.description}</p>
      )}
    </article>
  );
}

/**
 * The plan on screen: today's meals as large cards, a strip to pick any day of the week, and a
 * card per day underneath. "Today" follows the date the plan was made, so Day 1 is the day it was
 * created. After the last day it says the plan has ended instead of pretending it is still current.
 */
export function ActivePlan({ plan, timeZone }: { plan: DietPlan; timeZone?: string }) {
  const total = plan.days.length;
  const today = planDayNumber(plan.created_at, new Date(), timeZone);
  const ended = today > total;
  const current = Math.min(Math.max(today, 1), Math.max(total, 1));
  const [selected, setSelected] = useState(current);
  useEffect(() => setSelected(current), [plan.id, current]);

  const day = plan.days.find((d) => d.day === selected) ?? plan.days[0];
  if (!day) return null;
  const label = planDayLabel(plan.created_at, day.day, timeZone);
  const isToday = day.day === today;
  const c = plan.constraints_used;
  const cols = day.meals.length >= 4 ? "xl:grid-cols-4" : "xl:grid-cols-3";

  return (
    <div className="space-y-8" aria-live="polite">
      <div className="space-y-3">
        <Alert tone="info" title="General ideas only">
          {plan.notice}
        </Alert>
        {ended && (
          <Alert tone="warning" title="This plan has ended">
            It covered {total} days, from {planDayLabel(plan.created_at, 1, timeZone).long}. Make a new plan when you are ready.
          </Alert>
        )}
        {visibleFlags(plan.review_flags).map((f) => (
          <Alert key={f.code} tone={FLAG_TONE[f.severity]}>
            {f.message}
          </Alert>
        ))}
      </div>

      <section aria-labelledby="day-picker-h" className="space-y-3">
        <h2 id="day-picker-h" className="sr-only">
          Choose a day
        </h2>
        <div role="group" aria-label="Choose a day" className="flex gap-2 overflow-x-auto pb-1">
          {plan.days.map((d) => {
            const l = planDayLabel(plan.created_at, d.day, timeZone);
            const active = d.day === selected;
            return (
              <button
                key={d.day}
                type="button"
                aria-pressed={active}
                onClick={() => setSelected(d.day)}
                className={cn(
                  "min-h-[64px] min-w-[96px] flex-1 rounded-xl border px-3 py-2 text-left transition-colors",
                  active ? "border-teal-700 bg-teal-700 text-white" : "border-line bg-surface text-ink hover:bg-mint-100",
                )}
              >
                <span className={cn("block text-xs font-medium", active ? "text-white/80" : "text-ink-soft")}>
                  {d.day === today ? "Today" : l.weekday}
                </span>
                <span className="block text-sm font-semibold">Day {d.day}</span>
                <span className={cn("block text-xs", active ? "text-white/80" : "text-ink-soft")}>{l.date}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="day-h" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="day-h" className="text-h2 text-navy-900">
            {isToday ? "Today" : `Day ${day.day}`}
            <span className="ml-2 text-base font-normal text-ink-soft">{label.long}</span>
          </h2>
          {!ended && (
            <p className="text-sm text-ink-soft">
              Day {current} of {total}
            </p>
          )}
        </div>
        <div className={cn("grid gap-4 sm:grid-cols-2", cols)}>
          {day.meals.map((m, i) => (
            <MealCard key={`${day.day}-${i}`} meal={m} />
          ))}
        </div>
      </section>

      <section aria-labelledby="week-h" className="space-y-3">
        <h2 id="week-h" className="text-h3 text-navy-900">
          The whole week
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {plan.days.map((d) => {
            const l = planDayLabel(plan.created_at, d.day, timeZone);
            const active = d.day === selected;
            return (
              <li key={d.day}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(d.day);
                    window.scrollTo?.({ top: 0, behavior: "smooth" });
                  }}
                  aria-label={`Show day ${d.day}, ${l.long}`}
                  className={cn(
                    "h-full w-full rounded-card border bg-surface p-4 text-left shadow-sm transition-colors hover:bg-mint-100",
                    active ? "border-teal-700 ring-1 ring-teal-700" : "border-line",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-navy-900">
                      Day {d.day} <span className="font-normal text-ink-soft">· {l.weekday} {l.date}</span>
                    </span>
                    {d.day === today && (
                      <span className="rounded-full bg-mint-100 px-2 py-0.5 text-xs font-semibold text-teal-700">Today</span>
                    )}
                  </span>
                  <span className="mt-2 block space-y-1 text-sm">
                    {d.meals.map((m, i) => (
                      <span key={i} className="flex gap-2">
                        <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                          {SLOT_LABEL[m.slot]}
                        </span>
                        <span className="min-w-0 text-ink">{m.name ?? "–"}</span>
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <details className="rounded-card border border-line bg-surface p-4 text-sm">
        <summary className="min-h-[44px] cursor-pointer font-semibold text-teal-700">What this plan used, and its limits</summary>
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-ink-soft">
          <li>Eating pattern: {c.diet_type.replace(/_/g, " ")}</li>
          <li>Regional style: {c.cuisine.replace(/_/g, " ")}</li>
          <li>Foods left out: {c.avoid_foods.length ? c.avoid_foods.join(", ") : "none listed"}</li>
          <li>Recorded allergies applied: {c.allergies_applied.length ? c.allergies_applied.join(", ") : "none"}</li>
          <li>{c.ideas_available} ideas matched your choices.</li>
        </ul>
        <p className="mt-3 font-semibold text-ink">Limits of this plan</p>
        <ul className="list-disc pl-5 text-ink-soft">
          {plan.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
