"use client";

import { ReportCard } from "@/components/safety/ReportCard";
import { SafetyNotice } from "@/components/safety/SafetyNotice";
import { PageHeader } from "@/components/ui/PageHeader";

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="Note a side effect" description="This keeps a private record of what you noticed. It does not show that a medicine caused it, and nothing is sent to a doctor or regulator. If you feel very unwell, get medical help now." />
      <SafetyNotice />
      <ReportCard />
    </div>
  );
}
