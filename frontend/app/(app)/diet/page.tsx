"use client";

import { useState } from "react";
import { PlansCard } from "@/components/diet/PlansCard";
import { PreferencesCard } from "@/components/diet/PreferencesCard";
import { Alert } from "@/components/ui/primitives";
import { blocked, type DietPreferences } from "@/lib/diet";

export default function DietPage() {
  const [prefs, setPrefs] = useState<DietPreferences | null>(null);
  const [version, setVersion] = useState(0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Diet ideas</h1>
        <p className="mt-1 text-ink-soft">Simple weekly meal ideas that follow your food choices.</p>
      </div>
      <Alert tone="warning" title="Education, not treatment">
        These are general ideas. They are not a prescription and are not adjusted for your health. Talk to a doctor or
        registered dietitian before changing what you eat for a health reason.
      </Alert>
      <PreferencesCard
        onSaved={(p) => {
          setPrefs(p);
          setVersion((v) => v + 1);
        }}
      />
      <PlansCard canCreate={!!prefs?.saved && !blocked(prefs.review_flags)} version={version} />
    </div>
  );
}
