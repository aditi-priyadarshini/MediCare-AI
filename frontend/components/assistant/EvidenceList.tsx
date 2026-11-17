"use client";

import Link from "next/link";
import { VerificationBadge } from "@/components/ui/primitives";
import { evidenceHref, EVIDENCE_PAGE_KEY, orderEvidence, SOURCE_LABEL_KEY } from "@/lib/assistant";
import { useT } from "@/lib/i18n";
import type { EvidenceItem } from "@/lib/types";

interface Props {
  messageId: string;
  items: EvidenceItem[];
  /** When given, the parent controls whether the list is expanded (so a citation can open it). */
  open?: boolean;
  onToggle?: (open: boolean) => void;
}

/** Renders only what the API returned for this answer. Nothing is added, ranked or invented here. */
export function EvidenceList({ messageId, items, open, onToggle }: Props) {
  const { t } = useT();
  if (items.length === 0) return null;
  const used = items.filter((i) => i.cited).length;
  return (
    <details
      className="mt-3 rounded-lg border border-line bg-surface p-3 text-sm"
      open={open}
      onToggle={onToggle ? (e) => onToggle(e.currentTarget.open) : undefined}
    >
      <summary className="min-h-[44px] cursor-pointer py-2 font-medium text-ink">
        {t("assistant.evidence.summary", { count: items.length, used })}
      </summary>
      <ul className="mt-2 space-y-2">
        {orderEvidence(items).map((e) => {
          const href = evidenceHref(e);
          const page = href ? t(EVIDENCE_PAGE_KEY[href]!) : null;
          return (
            <li key={e.id} id={`ev-${messageId}-${e.ref}`} tabIndex={-1} className="rounded border border-line/70 p-2">
              <p className="font-medium text-ink">
                <span className="mr-2 rounded bg-mint-100 px-1.5 py-0.5 text-xs text-teal-700">{e.ref}</span>
                {e.source_label}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-ink-soft">
                <span>{t(SOURCE_LABEL_KEY[e.source_type])}</span>
                <span>· {e.recorded_at ?? t("assistant.evidence.noDate")}</span>
                {e.verification_status && <VerificationBadge status={e.verification_status} />}
                <span>· {e.cited ? t("assistant.evidence.used") : t("assistant.evidence.unused")}</span>
              </p>
              {href && page && (
                <Link href={href} className="mt-1 inline-flex min-h-[44px] items-center text-sm font-medium text-teal-700 underline">
                  {t("assistant.evidence.open", { page })}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
