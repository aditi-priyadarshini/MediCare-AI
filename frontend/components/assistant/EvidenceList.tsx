"use client";

import { VerificationBadge } from "@/components/ui/primitives";
import { evidenceDate, orderEvidence, SOURCE_LABEL } from "@/lib/assistant";
import type { EvidenceItem } from "@/lib/types";

export function EvidenceList({ messageId, items }: { messageId: string; items: EvidenceItem[] }) {
  if (items.length === 0) return null;
  const used = items.filter((i) => i.cited).length;
  return (
    <details className="mt-3 rounded-lg border border-line bg-surface p-3 text-sm">
      <summary className="cursor-pointer font-medium text-ink">
        What this answer looked at ({items.length}, {used} used)
      </summary>
      <ul className="mt-2 space-y-2">
        {orderEvidence(items).map((e) => (
          <li key={e.id} id={`ev-${messageId}-${e.ref}`} className="rounded border border-line/70 p-2">
            <p className="font-medium text-ink">
              <span className="mr-2 rounded bg-mint-100 px-1.5 py-0.5 text-xs text-teal-700">{e.ref}</span>
              {e.source_label}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-ink-soft">
              <span>{SOURCE_LABEL[e.source_type]}</span>
              <span>· {evidenceDate(e)}</span>
              {e.verification_status && <VerificationBadge status={e.verification_status} />}
              <span>· {e.cited ? "Used in the answer" : "Looked at, not used"}</span>
            </p>
          </li>
        ))}
      </ul>
    </details>
  );
}
