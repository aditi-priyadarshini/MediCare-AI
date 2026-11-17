"use client";

import { AuthenticityCard } from "@/components/safety/AuthenticityCard";
import { SafetyNotice } from "@/components/safety/SafetyNotice";
import { PageHeader } from "@/components/ui/PageHeader";

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="Is this pack genuine?" description="We can only confirm a pack when an authoritative source is connected." />
      <SafetyNotice />
      <AuthenticityCard />
    </div>
  );
}
