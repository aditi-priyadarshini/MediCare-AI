"use client";

import { AiGenericsCard } from "@/components/safety/AiGenericsCard";
import { AlternativesCard } from "@/components/safety/AlternativesCard";
import { SafetyNotice } from "@/components/safety/SafetyNotice";
import { PageHeader } from "@/components/ui/PageHeader";

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="Generics and prices" description="Find other products with the same ingredients, strength and form, with rough prices. These are candidates to discuss with a pharmacist, not substitutes." />
      <SafetyNotice />
      <AiGenericsCard />
      <AlternativesCard />
    </div>
  );
}
