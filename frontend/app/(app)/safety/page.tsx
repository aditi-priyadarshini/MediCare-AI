"use client";

import { AlternativesCard } from "@/components/safety/AlternativesCard";
import { AuthenticityCard } from "@/components/safety/AuthenticityCard";
import { CheckCard } from "@/components/safety/CheckCard";
import { LookupCard } from "@/components/safety/LookupCard";
import { ReportCard } from "@/components/safety/ReportCard";
import { Alert } from "@/components/ui/primitives";

export default function SafetyPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Medicine safety</h1>
        <p className="mt-1 text-ink-soft">See what needs attention in what you take, look up any medicine, compare options, and keep notes about side effects.</p>
      </div>
      <Alert tone="info" title="A guide, not advice">
        These tools use a small reference dataset. Finding nothing does not mean something is safe. Talk to a
        pharmacist or your prescriber before you start, stop or change a medicine.
      </Alert>
      <CheckCard />
      <LookupCard />
      <AlternativesCard />
      <ReportCard />
      <AuthenticityCard />
    </div>
  );
}
