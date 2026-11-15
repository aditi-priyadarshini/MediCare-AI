"use client";

import { RecordsSection } from "@/components/records/RecordsSection";

export default function RecordsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Records</h1>
        <p className="mt-1 text-ink-soft">Your reports, prescriptions and scans in one place. Only you can see them.</p>
      </div>
      <RecordsSection />
    </div>
  );
}
