"use client";

import { useCallback, useState } from "react";
import { AlertsCard, RemindersCard } from "@/components/medications/AlertsCard";
import { DosesCard } from "@/components/medications/DosesCard";
import { MedicationsCard } from "@/components/medications/MedicationsCard";

export default function MedicationsPage() {
  // Bumping the version reloads every card after any change (a dose taken can change stock).
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Medicines</h1>
        <p className="mt-1 text-ink-soft">Keep track of what you take, when, and how much you have left.</p>
      </div>
      <RemindersCard version={version} onChange={refresh} />
      <AlertsCard version={version} />
      <DosesCard version={version} onChange={refresh} />
      <MedicationsCard version={version} onChange={refresh} />
    </div>
  );
}
