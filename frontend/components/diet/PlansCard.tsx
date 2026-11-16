"use client";

import { useState } from "react";
import { Alert, Button, Card, EmptyState, PageLoading } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { formatDate } from "@/lib/care";
import { FLAG_TONE, SLOT_LABEL, visibleFlags, type DietPlan, type DietPlanSummary } from "@/lib/diet";
import { useAsync } from "@/lib/hooks";
import type { Page } from "@/lib/types";

function PlanView({ plan }: { plan: DietPlan }) {
  const c = plan.constraints_used;
  return (
    <div className="space-y-4" aria-live="polite">
      <Alert tone="info" title="General ideas only">
        {plan.notice}
      </Alert>
      {visibleFlags(plan.review_flags).map((f) => (
        <Alert key={f.code} tone={FLAG_TONE[f.severity]}>
          {f.message}
        </Alert>
      ))}
      <div className="rounded-lg border border-line p-4 text-sm">
        <h3 className="font-semibold text-ink">What this plan used</h3>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-soft">
          <li>Eating pattern: {c.diet_type.replace(/_/g, " ")}</li>
          <li>Regional style: {c.cuisine.replace(/_/g, " ")}</li>
          <li>Foods left out: {c.avoid_foods.length ? c.avoid_foods.join(", ") : "none listed"}</li>
          <li>Recorded allergies applied: {c.allergies_applied.length ? c.allergies_applied.join(", ") : "none"}</li>
          <li>{c.ideas_available} ideas matched your choices.</li>
        </ul>
      </div>
      <div className="space-y-3">
        {plan.days.map((d) => (
          <section key={d.day} aria-labelledby={`day-${plan.id}-${d.day}`} className="rounded-lg border border-line p-4">
            <h3 id={`day-${plan.id}-${d.day}`} className="font-semibold text-ink">
              Day {d.day}
            </h3>
            <dl className="mt-2 space-y-2">
              {d.meals.map((m, i) => (
                <div key={i}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{SLOT_LABEL[m.slot]}</dt>
                  <dd className="text-sm">
                    {m.name ? (
                      <>
                        <span className="font-medium text-ink">{m.name}.</span>{" "}
                        <span className="text-ink-soft">{m.description}</span>
                        <span className="block text-xs text-ink-soft">Contains: {m.ingredients.join(", ")}</span>
                      </>
                    ) : (
                      <span className="text-ink-soft">{m.description}</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <div className="text-xs text-ink-soft">
        <p className="font-semibold">Limits of this plan</p>
        <ul className="list-disc pl-5">
          {plan.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function PlansCard({ canCreate, version }: { canCreate: boolean; version: number }) {
  const [local, setLocal] = useState(0);
  const list = useAsync(() => api<Page<DietPlanSummary>>("/diet/plans?limit=20"), [version, local]);
  const [plan, setPlan] = useState<DietPlan | null>(null);
  const [failure, setFailure] = useState<{ code: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setFailure(null);
    try {
      setPlan(await api<DietPlan>("/diet/plans", { method: "POST", body: {} }));
      setLocal((n) => n + 1);
    } catch (e) {
      setFailure({ code: (e as { code?: string }).code ?? "", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function open(id: string) {
    setFailure(null);
    try {
      setPlan(await api<DietPlan>(`/diet/plans/${id}`));
    } catch (e) {
      setFailure({ code: "", message: errorMessage(e) });
    }
  }

  async function remove(id: string) {
    try {
      await api(`/diet/plans/${id}`, { method: "DELETE" });
      if (plan?.id === id) setPlan(null);
      setLocal((n) => n + 1);
    } catch (e) {
      setFailure({ code: "", message: errorMessage(e) });
    }
  }

  return (
    <Card aria-labelledby="plans-h" className="space-y-4">
      <div>
        <h2 id="plans-h" className="text-lg font-semibold text-ink">
          7-day meal ideas
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Built from the preferences above using a small collection of meal ideas. No calories, portions or health
          claims.
        </p>
      </div>
      <Button onClick={() => void create()} loading={busy} disabled={!canCreate}>
        Make a 7-day plan
      </Button>
      {!canCreate && <p className="text-sm text-ink-soft">Save your preferences first.</p>}
      {failure && (
        <Alert
          tone={failure.code === "DIETITIAN_REVIEW_REQUIRED" ? "warning" : "danger"}
          title={failure.code === "DIETITIAN_REVIEW_REQUIRED" ? "Please talk to a clinician or dietitian" : "Could not make a plan"}
        >
          {failure.message}
        </Alert>
      )}
      {list.loading && !list.data && <PageLoading label="Loading your plans" />}
      {list.data && list.data.items.length === 0 && !plan && (
        <EmptyState title="No plans yet">Your saved plans will be listed here.</EmptyState>
      )}
      {list.data && list.data.items.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {list.data.items.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="text-sm">
                <span className="font-medium text-ink">{p.title}</span>{" "}
                <span className="text-ink-soft">{formatDate(p.created_at)}</span>
              </span>
              <span className="flex gap-1">
                <Button variant="ghost" onClick={() => void open(p.id)}>
                  View
                </Button>
                <Button variant="ghost" onClick={() => void remove(p.id)}>
                  Delete
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {plan && <PlanView plan={plan} />}
    </Card>
  );
}
