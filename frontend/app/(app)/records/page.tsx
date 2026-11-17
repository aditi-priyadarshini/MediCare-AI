"use client";

import { RecordsSection } from "@/components/records/RecordsSection";
import { PageHeader } from "@/components/ui";
import { useT } from "@/lib/i18n";

export default function RecordsPage() {
  const { t } = useT();
  return (
    <div>
      <PageHeader title={t("nav.medicalRecords")} description="Your reports, prescriptions and scans in one place. Only you can see them." />
      <RecordsSection />
    </div>
  );
}
