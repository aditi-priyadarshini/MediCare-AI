"use client";

import { ArrowDown, ArrowUp, Minus, Pencil, Trash2 } from "lucide-react";
import { Button, VerificationBadge } from "@/components/ui/primitives";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { FLAG_LABEL, formatDate, formatLabValue, formatRange } from "@/lib/records";
import type { LabFlag, LabResult } from "@/lib/types";

const FLAG: Record<LabFlag, { tone: StatusTone; icon: typeof Minus }> = {
  low: { tone: "caution", icon: ArrowDown },
  high: { tone: "caution", icon: ArrowUp },
  normal: { tone: "neutral", icon: Minus },
  unknown: { tone: "neutral", icon: Minus },
};

/**
 * Where the value sits against the range printed on its own report: icon + words ("Below report
 * range"), amber only for outside the range, never red or green and never "abnormal".
 */
export function FlagBadge({ flag }: { flag: LabFlag }) {
  const f = FLAG[flag];
  return (
    <StatusBadge tone={f.tone} icon={f.icon}>
      {FLAG_LABEL[flag]}
    </StatusBadge>
  );
}

interface Actions {
  onEdit: (l: LabResult) => void;
  onRemove: (l: LabResult) => void;
}

const label = (l: LabResult) => `${l.test_name} result from ${formatDate(l.observed_on)}`;

function RowActions({ l, onEdit, onRemove }: { l: LabResult } & Actions) {
  return (
    <div className="flex flex-wrap gap-1">
      <Button variant="ghost" aria-label={`Edit ${label(l)}`} onClick={() => onEdit(l)}>
        <Pencil className="h-4 w-4" aria-hidden /> Edit
      </Button>
      <Button variant="ghost" aria-label={`Remove ${label(l)}`} onClick={() => onRemove(l)}>
        <Trash2 className="h-4 w-4" aria-hidden /> Remove
      </Button>
    </div>
  );
}

/** One result as a stacked card (phones). */
export function LabResultCard({ l, showTest, ...actions }: { l: LabResult; showTest?: boolean } & Actions) {
  const range = formatRange(l.ref_low, l.ref_high, l.unit);
  return (
    <li className="space-y-2 p-3">
      {showTest && <p className="text-sm font-semibold text-navy-900">{l.test_name}</p>}
      <p className="text-lg font-semibold text-ink tnum">{formatLabValue(l)}</p>
      <div className="flex flex-wrap items-center gap-2">
        <FlagBadge flag={l.flag} />
        <VerificationBadge status={l.verification_status} />
      </div>
      <p className="text-xs text-ink-soft tnum">
        {formatDate(l.observed_on)}
        {range ? ` · Report range ${range}` : " · No range on report"}
      </p>
      <RowActions l={l} {...actions} />
    </li>
  );
}

/** Results as a table (wider screens). `showTest` adds a Test column for the all-results view. */
export function LabResultsTable({ items, showTest, ...actions }: { items: LabResult[]; showTest?: boolean } & Actions) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <caption className="sr-only">{showTest ? "All lab results" : "Results for this test"}</caption>
        <thead className="bg-canvas text-xs uppercase tracking-wide text-ink-soft">
          <tr>
            {showTest && <th scope="col" className="p-3">Test</th>}
            <th scope="col" className="p-3">Date</th>
            <th scope="col" className="p-3">Result</th>
            <th scope="col" className="p-3">Report range</th>
            <th scope="col" className="p-3">Compared with report range</th>
            <th scope="col" className="p-3">Source</th>
            <th scope="col" className="p-3"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((l) => (
            <tr key={l.id} className="border-t border-line">
              {showTest && <th scope="row" className="p-3 font-medium text-ink">{l.test_name}</th>}
              <td className="p-3 text-ink tnum">{formatDate(l.observed_on)}</td>
              <td className="p-3 font-medium text-ink tnum">{formatLabValue(l)}</td>
              <td className="p-3 text-ink-soft tnum">{formatRange(l.ref_low, l.ref_high, l.unit) ?? "None on report"}</td>
              <td className="p-3"><FlagBadge flag={l.flag} /></td>
              <td className="p-3"><VerificationBadge status={l.verification_status} /></td>
              <td className="p-3"><RowActions l={l} {...actions} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
