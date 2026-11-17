"use client";

import { CheckCard } from "@/components/safety/CheckCard";
import { SafetyNotice } from "@/components/safety/SafetyNotice";
import { PageHeader } from "@/components/ui/PageHeader";

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="My medicines" description="Checks what you take now against each other, your health conditions and your allergies. It cannot tell you that something is safe." />
      <SafetyNotice />
      <CheckCard />
    </div>
  );
}
