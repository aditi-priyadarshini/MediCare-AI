"use client";

import { useState } from "react";
import { AppointmentsPanel } from "@/components/care/AppointmentsPanel";
import { DoctorFinder } from "@/components/care/DoctorFinder";
import { PharmacyFinder } from "@/components/care/PharmacyFinder";
import { Alert } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

const TABS = [
  { id: "pharmacies", label: "Pharmacies" },
  { id: "doctors", label: "Doctors" },
  { id: "appointments", label: "Appointments" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function CarePage() {
  const [tab, setTab] = useState<Tab>("pharmacies");
  const [version, setVersion] = useState(0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Find care</h1>
        <p className="mt-1 text-ink-soft">Look up pharmacies and doctors, and keep track of appointment requests.</p>
      </div>
      <Alert tone="info" title="Check before you travel">
        Listings can be out of date. Every entry shows where it came from and how old it is. This is not an emergency
        service: in an emergency, call 112.
      </Alert>
      <div role="tablist" aria-label="Care" className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn(
              "min-h-[44px] border-b-2 px-4 text-sm font-semibold",
              tab === t.id ? "border-teal-700 text-teal-700" : "border-transparent text-ink-soft hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "pharmacies" && <PharmacyFinder />}
        {tab === "doctors" && <DoctorFinder onBooked={() => setVersion((v) => v + 1)} />}
        {tab === "appointments" && <AppointmentsPanel version={version} />}
      </div>
    </div>
  );
}
