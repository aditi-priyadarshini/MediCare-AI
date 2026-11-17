"use client";

import { LabsSection } from "@/components/records/LabsSection";
import { PageHeader } from "@/components/ui";
import { useT } from "@/lib/i18n";

export default function LabsPage() {
  const { t } = useT();
  return (
    <div>
      <PageHeader title={t("nav.labResults")} description="Track a test over time, using the ranges printed on your own reports." />
      <LabsSection />
    </div>
  );
}
