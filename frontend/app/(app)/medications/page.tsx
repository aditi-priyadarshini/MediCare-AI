"use client";

import { Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { AddMedicationFlow } from "@/components/medications/AddMedicationFlow";
import { AlertsCard, RemindersCard } from "@/components/medications/AlertsCard";
import { DosesCard } from "@/components/medications/DosesCard";
import { MedicationsCard } from "@/components/medications/MedicationsCard";
import { Button, PageHeader } from "@/components/ui";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks";
import { useT } from "@/lib/i18n";
import type { Dose, MedAlert, Medication, Page } from "@/lib/types";

const DAY = 86_400_000;

export default function MedicationsPage() {
  const { t } = useT();
  // Bumping the version reloads every card after any change (a dose taken can change stock).
  const [version, setVersion] = useState(0);
  const [adding, setAdding] = useState(false);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  // One request each, shared by the cards that need them (the list and the doses card both read
  // medicines and doses; the list and the alerts card both read alerts).
  const meds = useAsync(() => api<Page<Medication>>("/medications?limit=100"), [version]);
  const doses = useAsync(() => {
    const from = new Date(Date.now() - DAY).toISOString();
    const to = new Date(Date.now() + 2 * DAY).toISOString();
    return api<Page<Dose>>(`/doses?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=100`);
  }, [version]);
  const alerts = useAsync(() => api<MedAlert[]>("/medications/alerts"), [version]);

  return (
    <div>
      <PageHeader
        title={t("nav.medications")}
        description="Keep track of what you take, when, and how much you have left."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" aria-hidden /> Add medicine
          </Button>
        }
      />
      <div className="space-y-6">
        <RemindersCard version={version} onChange={refresh} />
        <AlertsCard alerts={alerts} />
        <DosesCard list={doses} meds={meds} onChange={refresh} />
        <MedicationsCard meds={meds} doses={doses} alerts={alerts} onChange={refresh} onAdd={() => setAdding(true)} />
      </div>
      <AddMedicationFlow open={adding} onClose={() => setAdding(false)} onAdded={refresh} />
    </div>
  );
}
