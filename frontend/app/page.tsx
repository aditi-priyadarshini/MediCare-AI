"use client";

import { CalendarClock, Pill, Stethoscope, type LucideIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AppointmentsPanel } from "@/components/care/AppointmentsPanel";
import { DoctorFinder } from "@/components/care/DoctorFinder";
import { PharmacyFinder } from "@/components/care/PharmacyFinder";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert, PageLoading } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

const TABS: Array<{ id: "pharmacies" | "doctors" | "appointments"; label: string; icon: LucideIcon }> = [
  { id: "pharmacies", label: "Pharmacies", icon: Pill },
  { id: "doctors", label: "Doctors", icon: Stethoscope },
  { id: "appointments", label: "Appointments", icon: CalendarClock },
];
type Tab = (typeof TABS)[number]["id"];

function CareTabs() {
  const wanted = useSearchParams()?.get("tab");
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.id === wanted) ? (wanted as Tab) : "pharmacies");

  return (
    <>
      <div role="tablist" aria-label="Care" className="flex gap-2 overflow-x-auto border-b border-line">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => setTab(id)}
            className={cn(
              "inline-flex min-h-[48px] items-center gap-2 border-b-2 px-4 text-sm font-semibold",
              tab === id ? "border-teal-700 text-teal-700" : "border-transparent text-ink-soft hover:text-ink",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden /> {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "pharmacies" && <PharmacyFinder />}
        {tab === "doctors" && <DoctorFinder />}
        {tab === "appointments" && <AppointmentsPanel version={0} />}
      </div>
    </>
  );
}

export default function CarePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        className="mb-0"
        title="Find care"
        description="Look up pharmacies and doctors, and keep track of appointment requests."
      />
      <Alert tone="info" title="Check before you travel">
        Listings can be out of date. Every entry shows where it came from and how old it is. This is not an emergency service: in an
        emergency, call 112.
      </Alert>
      {/* CareTabs reads ?tab= so a finished booking can land on Appointments; Next needs a Suspense boundary for that. */}
      <Suspense fallback={<PageLoading label="Loading" />}>
        <CareTabs />
      </Suspense>
    </div>
  );
}
