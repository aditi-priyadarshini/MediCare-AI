"use client";

import { AiPanel } from "@/components/dashboard/AiPanel";
import { AttentionCard } from "@/components/dashboard/AttentionCard";
import { CompletionTile, HealthSection } from "@/components/dashboard/DashboardSections";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { TodayCard } from "@/components/dashboard/TodayCard";
import { UpcomingCard } from "@/components/dashboard/UpcomingCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { api } from "@/lib/api-client";
import { doseCounts, firstName, todaysDoses } from "@/lib/dashboard";
import { useExperience } from "@/lib/experience";
import { useAsync } from "@/lib/hooks";
import { useT } from "@/lib/i18n";
import { useProfile } from "@/lib/profile-context";
import type { Dose, Page } from "@/lib/types";

const DAY = 86_400_000;

export default function DashboardPage() {
  const { profile } = useProfile();
  const { t } = useT();
  const { experience, ready } = useExperience();
  const easy = experience === "easy";
  // Wait for the saved reading mode so Easy-read users never trigger the extra requests for a moment.
  const standard = ready && !easy;

  // Shared by more than one tile, so fetched once here. Each tile still handles its own failure.
  const doses = useAsync(() => {
    const from = new Date(Date.now() - DAY).toISOString();
    const to = new Date(Date.now() + 2 * DAY).toISOString();
    return api<Page<Dose>>(`/doses?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=100`);
  }, []);

  const counts = doses.data ? doseCounts(todaysDoses(doses.data.items, profile.timezone, new Date())) : null;
  const context =
    counts && counts.waiting > 0
      ? counts.overdue > 0
        ? t("dash.ctx.overdue", { n: counts.waiting, o: counts.overdue })
        : t(counts.waiting === 1 ? "dash.ctx.one" : "dash.ctx.many", { n: counts.waiting })
      : t("dash.ctx.neutral");

  return (
    <div className="dash-root mx-auto min-w-0 max-w-[1200px] space-y-6">
      <PageHeader className="mb-0" title={t("dash.hello", { name: firstName(profile.display_name) })} description={context} />

      {/* A slim full-width strip, so it no longer leaves a hole beside the greeting. */}
      {standard && <CompletionTile />}

      <div className="grid gap-4 lg:grid-cols-12">
        <div className={easy ? "lg:col-span-7" : "lg:col-span-8"}>
          <TodayCard doses={doses} />
        </div>
        <div className={easy ? "lg:col-span-5" : "lg:col-span-4"}>
          <AttentionCard />
        </div>
      </div>

      {standard && <HealthSection doses={doses} />}

      {/* Upcoming requests hide themselves when there are none; the empty cell then drops out of the grid. */}
      <div className="grid gap-4 lg:auto-cols-fr lg:grid-flow-col">
        <div className="min-w-0">
          <AiPanel simple={easy} />
        </div>
        {standard && (
          <div className="min-w-0 empty:hidden">
            <UpcomingCard />
          </div>
        )}
      </div>

      <QuickActions />
    </div>
  );
}
