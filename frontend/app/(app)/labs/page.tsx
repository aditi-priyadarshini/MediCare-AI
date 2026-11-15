"use client";

import { LabsSection } from "@/components/records/LabsSection";

export default function LabsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Lab results</h1>
        <p className="mt-1 text-ink-soft">Track a test over time, using the ranges printed on your own reports.</p>
      </div>
      <LabsSection />
    </div>
  );
}
