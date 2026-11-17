"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ActivePlan } from "@/components/diet/PlanDays";
import { LinkButton } from "@/components/ui/LinkButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert, Button, Card, EmptyState, PageLoading } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { formatDate } from "@/lib/care";
import {
  CUISINES,
  DIET_TYPES,
  FLAG_TONE,
  blocked,
  shortLabel,
  visibleFlags,
  type DietPlan,
  type DietPlanSummary,
  type DietPreferences,
} from "@/lib/diet";
import { useAsync } from "@/lib/hooks";
import { useOptionalProfile } from "@/lib/profile-context";
import type { Page } from "@/lib/types";

function Chip({ children }: { children: React.ReactNode }) {
  return <li className="rounded-full bg-mint-100 px-3 py-1 text-sm text-teal-700">{children}</li>;
}

/**
 * The Diet page. The newest plan is the active one and fills the screen as cards for each day;
 * the food-preferences form and older plans sit behind buttons instead of staying open.
 */
export function DietPlanner() {
  const timeZone = useOptionalProfile()?.profile.timezone;
  const prefs = useAsync(() => api<DietPreferences>("/diet/preferences"), []);
  const [reload, setReload] = useState(0);
  const plans = useAsync(() => api<Page<DietPlanSummary>>("/diet/plans?limit=20"), [reload]);
  const [plan, setPlan] = useState<DietPlan | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [failure, setFailure] = useState<{ code: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const items = plans.data?.items ?? [];
  const latestId = items[0]?.id ?? null;
  const showId = viewing ?? latestId;

  useEffect(() => {
    if (!showId) {
      setPlan(null);
      return;
    }
    if (plan?.id === showId) return;
    let cancelled = false;
    api<DietPlan>(`/diet/plans/${showId}`)
      .then((p) => !cancelled && setPlan(p))
      .catch((e) => !cancelled && setFailure({ code: "", message: errorMessage(e) }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showId]);

  async function create() {
    setBusy(true);
    setFailure(null);
    try {
      const made = await api<DietPlan>("/diet/plans", { method: "POST", body: {} });
      setPlan(made);
      setViewing(null);
      setShowPast(false);
      setReload((n) => n + 1);
    } catch (e) {
      setFailure({ code: (e as { code?: string }).code ?? "", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this meal plan? This cannot be undone.")) return;
    try {
      await api(`/diet/plans/${id}`, { method: "DELETE" });
      if (plan?.id === id) setPlan(null);
      if (viewing === id) setViewing(null);
      setReload((n) => n + 1);
    } catch (e) {
      setFailure({ code: "", message: errorMessage(e) });
    }
  }

  if (prefs.loading && !prefs.data) return <PageLoading label="Loading your preferences" />;

  const p = prefs.data;
  const saved = !!p?.saved;
  const stop = p ? blocked(p.review_flags) : undefined;
  const canCreate = saved && !stop;
  const hasPlan = items.length > 0;
  const past = items.filter((i) => i.id !== latestId);
  const olderOpen = viewing !== null && viewing !== latestId;

  return (
    <div className="space-y-6">
      <PageHeader
        className="mb-0"
        title="Diet ideas"
        description="Simple weekly meal ideas that follow your food choices."
        actions={
          <>
            <LinkButton href="/diet/preferences" variant="secondary">
              <Pencil className="h-4 w-4" aria-hidden /> {saved ? "Edit food preferences" : "Set food preferences"}
            </LinkButton>
            {canCreate && (
              <Button onClick={() => void create()} loading={busy}>
                {hasPlan ? "Make a new 7-day plan" : "Make a 7-day plan"}
              </Button>
            )}
          </>
        }
      />

      <Alert tone="warning" title="Education, not treatment">
        These are general ideas. They are not a prescription and are not adjusted for your health. Talk to a doctor or registered
        dietitian before changing what you eat for a health reason.
      </Alert>

      {prefs.error != null && !p && (
        <Alert tone="danger" title="Could not load">
          {errorMessage(prefs.error)}
        </Alert>
      )}

      {saved && p && (
        <section aria-label="Your food preferences" className="space-y-3">
          <ul className="flex flex-wrap gap-2">
            <Chip>{shortLabel(DIET_TYPES.find((d) => d.value === p.diet_type)?.label ?? p.diet_type)}</Chip>
            <Chip>{CUISINES.find((c) => c.value === p.cuisine)?.label ?? p.cuisine}</Chip>
            <Chip>{p.meals_per_day} meals a day</Chip>
            {p.avoid_foods.length > 0 && <Chip>Leaving out: {p.avoid_foods.join(", ")}</Chip>}
          </ul>
          {stop && (
            <Alert tone="danger" title="No meal plan can be made">
              {stop.message}
            </Alert>
          )}
          {visibleFlags(p.review_flags)
            .filter((f) => f.severity !== "block" && !plan)
            .map((f) => (
              <Alert key={f.code} tone={FLAG_TONE[f.severity]}>
                {f.message}
              </Alert>
            ))}
        </section>
      )}

      {failure && (
        <Alert
          tone={failure.code === "DIETITIAN_REVIEW_REQUIRED" ? "warning" : "danger"}
          title={failure.code === "DIETITIAN_REVIEW_REQUIRED" ? "Please talk to a clinician or dietitian" : "Could not make a plan"}
        >
          {failure.message}
        </Alert>
      )}

      {!saved && p && (
        <EmptyState
          title="Tell us how you eat first"
          action={
            <LinkButton href="/diet/preferences" variant="primary">
              Set food preferences
            </LinkButton>
          }
        >
          Your meal plan follows your eating pattern, regional style and foods you leave out.
        </EmptyState>
      )}

      {saved && !hasPlan && plans.data && !plans.loading && (
        <EmptyState title="No plan yet">
          {canCreate ? "Press “Make a 7-day plan” to see your meals as cards for each day." : "A plan can’t be made with your current choices."}
        </EmptyState>
      )}

      {plans.loading && !plans.data && <PageLoading label="Loading your plans" />}

      {olderOpen && (
        <Alert tone="info" title="You are looking at an older plan">
          <Button variant="secondary" onClick={() => setViewing(null)}>
            Back to my current plan
          </Button>
        </Alert>
      )}

      {plan && <ActivePlan plan={plan} timeZone={timeZone} />}

      {plan && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={() => void remove(plan.id)}>
            <Trash2 className="h-4 w-4" aria-hidden /> Delete this plan
          </Button>
          {past.length > 0 && (
            <Button variant="ghost" aria-expanded={showPast} onClick={() => setShowPast((s) => !s)}>
              {showPast ? "Hide past plans" : `Past plans (${past.length})`}
            </Button>
          )}
        </div>
      )}

      {showPast && past.length > 0 && (
        <Card aria-labelledby="past-h" className="space-y-3">
          <h2 id="past-h" className="font-semibold text-navy-900">
            Past plans
          </h2>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {past.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="text-sm">
                  <span className="font-medium text-ink">{i.title}</span> <span className="text-ink-soft">{formatDate(i.created_at)}</span>
                </span>
                <span className="flex gap-1">
                  <Button variant="ghost" onClick={() => { setViewing(i.id); setShowPast(false); window.scrollTo?.({ top: 0 }); }}>
                    View
                  </Button>
                  <Button variant="ghost" onClick={() => void remove(i.id)}>
                    Delete
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
