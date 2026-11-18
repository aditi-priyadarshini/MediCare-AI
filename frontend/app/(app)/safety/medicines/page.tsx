"use client";

import { AiReviewCard } from "@/components/safety/AiReviewCard";
import { CheckCard } from "@/components/safety/CheckCard";
import { SafetyNotice } from "@/components/safety/SafetyNotice";
import { PageHeader } from "@/components/ui/PageHeader";

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="My medicines" description="Reviews what you take now against each other, your health conditions, your allergies and your age. It cannot tell you that something is safe." />
      <SafetyNotice />
      <CheckCard />
      <AiReviewCard />
    </div>
  );
}
