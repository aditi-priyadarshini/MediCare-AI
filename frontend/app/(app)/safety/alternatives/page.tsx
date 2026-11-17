"use client";

import { AlternativesCard } from "@/components/safety/AlternativesCard";
import { SafetyNotice } from "@/components/safety/SafetyNotice";
import { PageHeader } from "@/components/ui/PageHeader";

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="Compare medicines" description="Find other products with the same ingredients, strength, form and release type. These are candidates to discuss with a pharmacist, not substitutes." />
      <SafetyNotice />
      <AlternativesCard />
    </div>
  );
}
