"use client";

import { AssistantView } from "@/components/assistant/AssistantView";
import { PageHeader } from "@/components/ui/PageHeader";
import { useT } from "@/lib/i18n";

export default function AssistantPage() {
  const { t } = useT();
  return (
    <div>
      <PageHeader title={t("assistant.page.title")} description={t("assistant.page.desc")} />
      <AssistantView />
    </div>
  );
}
