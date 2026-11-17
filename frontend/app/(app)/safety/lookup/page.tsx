"use client";

import { LookupCard } from "@/components/safety/LookupCard";
import { SafetyNotice } from "@/components/safety/SafetyNotice";
import { PageHeader } from "@/components/ui/PageHeader";

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="Look up a medicine" description="Search by name to see side effects, and whether it clashes with your medicines, conditions or allergies. Looking it up does not add it to your list." />
      <SafetyNotice />
      <LookupCard />
    </div>
  );
}
