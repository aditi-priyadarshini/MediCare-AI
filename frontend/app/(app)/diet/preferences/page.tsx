"use client";

import { useState } from "react";
import { PreferencesForm } from "@/components/diet/PreferencesForm";
import { FormPage, useFinish } from "@/components/ui/FormPage";
import { LinkButton } from "@/components/ui/LinkButton";
import { Alert, PageLoading } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { blocked, type DietPreferences } from "@/lib/diet";
import { useAsync } from "@/lib/hooks";

export default function DietPreferencesPage() {
  const finish = useFinish("/diet");
  const loaded = useAsync(() => api<DietPreferences>("/diet/preferences"), []);
  const [stopped, setStopped] = useState<string | null>(null);

  if (loaded.loading && !loaded.data) return <PageLoading label="Loading your preferences" />;

  return (
    <FormPage
      title="Food preferences"
      description="Meal ideas follow these choices."
      backHref="/diet"
      backLabel="Diet ideas"
    >
      {loaded.error != null && !loaded.data && (
        <Alert tone="danger" title="Could not load">
          {errorMessage(loaded.error)}
        </Alert>
      )}
      {stopped ? (
        <div className="space-y-4">
          <Alert tone="danger" title="No meal plan can be made">
            {stopped}
          </Alert>
          <LinkButton href="/diet" variant="secondary">
            Back to Diet ideas
          </LinkButton>
        </div>
      ) : (
        <PreferencesForm
          initial={loaded.data ?? null}
          cancelHref="/diet"
          onSaved={(p) => {
            const stop = blocked(p.review_flags);
            if (stop) setStopped(stop.message);
            else finish("Food preferences saved.");
          }}
        />
      )}
    </FormPage>
  );
}
