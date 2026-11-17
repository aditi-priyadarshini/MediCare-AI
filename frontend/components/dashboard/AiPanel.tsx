"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { DashboardWidget } from "@/components/dashboard/DashboardWidget";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks";
import { useT } from "@/lib/i18n";
import type { AssistantStatus } from "@/lib/types";

/**
 * Entry to the assistant. The examples are only examples (they do not ask anything when clicked).
 * It states what the assistant may use and shows the real consent state from GET /assistant/status;
 * it never claims the assistant has read anything.
 */
export function AiPanel({ simple = false }: { simple?: boolean }) {
  const { t } = useT();
  const status = useAsync(() => api<AssistantStatus>("/assistant/status"), []);
  const granted = status.data?.consent_granted;
  return (
    <DashboardWidget id="ai" title={t("dash.ai.title")} icon={Sparkles} tone="ai">
      {!simple && (
        <>
          <p className="text-sm font-medium text-ink">{t("dash.ai.examples")}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink">
            <li>{t("dash.ai.q1")}</li>
            <li>{t("dash.ai.q2")}</li>
            <li>{t("dash.ai.q3")}</li>
          </ul>
        </>
      )}
      <p className="mt-3 text-sm text-ink">{t("dash.ai.scope")}</p>
      {status.data && (
        <div className="mt-3 space-y-1">
          <StatusBadge tone="ai">{t(granted ? "dash.ai.consentOn" : "dash.ai.consentOff")}</StatusBadge>
          <p className="text-xs text-ink-soft">
            {t("dash.ai.consentHint")}{" "}
            <Link href="/settings#privacy" className="font-semibold text-lavender-700 underline">
              {t("dash.ai.privacy")}
            </Link>
          </p>
        </div>
      )}
      <Link
        href="/assistant"
        className="mt-4 inline-flex min-h-control items-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-brand-900"
      >
        {t("dash.ai.open")}
      </Link>
      <p className="mt-3 text-xs text-ink-soft">{t("dash.ai.notice")}</p>
    </DashboardWidget>
  );
}
