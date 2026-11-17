"use client";

import { AlertTriangle, Pill } from "lucide-react";
import { Button, VerificationBadge } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ALERT_TITLE, BASIS_LABEL, formatInstant, medicationTitle } from "@/lib/medications";
import type { Dose, MedAlert, Medication } from "@/lib/types";

/** What the list knows about one medicine, already looked up from data the page loaded. */
export interface MedRowData {
  med: Medication;
  /** Earliest dose still waiting in the loaded window; null if none is loaded. */
  next: Dose | null;
  alerts: MedAlert[];
}

const BASIS_CLS = { prescribed: "bg-info-100 text-info-700", self_reported: "bg-mint-100 text-teal-700" } as const;

function BasisBadge({ med }: { med: Medication }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BASIS_CLS[med.basis]}`}>{BASIS_LABEL[med.basis]}</span>;
}

export function NextDose({ next, timeZone, asNeeded }: { next: Dose | null; timeZone: string; asNeeded: boolean }) {
  if (next && next.scheduled_at) {
    return (
      <span className="tnum">
        {formatInstant(next.scheduled_at, timeZone)}
        {next.overdue && <span className="ml-1 font-medium text-amber-600">(overdue)</span>}
      </span>
    );
  }
  return <span className="text-ink-soft">{asNeeded ? "Only when needed" : "None in the next 2 days"}</span>;
}

/** Supply status is only what /medications/alerts reports; no alert means none of those conditions apply. */
export function SupplyStatus({ alerts }: { alerts: MedAlert[] }) {
  if (alerts.length === 0) return <span className="text-ink-soft">No supply alerts</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {alerts.map((a) => (
        <StatusBadge key={`${a.kind}-${a.supply_id ?? "all"}`} tone={a.kind === "expired" ? "danger" : "caution"} icon={AlertTriangle}>
          {ALERT_TITLE[a.kind]}
        </StatusBadge>
      ))}
    </span>
  );
}

const details = (m: Medication) => [m.form, m.dose_text].filter(Boolean).join(" · ");

/** One medicine as a stacked card (phones). */
export function MedicationCard({ row, timeZone, onOpen }: { row: MedRowData; timeZone: string; onOpen: (m: Medication) => void }) {
  const { med } = row;
  return (
    <li className="space-y-2 p-3">
      <p className="flex items-center gap-2 font-medium text-ink">
        <Pill className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
        <span className="break-words">{medicationTitle(med)}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <BasisBadge med={med} />
        <VerificationBadge status={med.verification_status} />
        {med.as_needed && <span className="text-ink-soft">Only when needed</span>}
        {details(med) && <span className="text-ink-soft">{details(med)}</span>}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-ink-soft">Next dose</dt>
        <dd><NextDose next={row.next} timeZone={timeZone} asNeeded={med.as_needed} /></dd>
        <dt className="text-ink-soft">Supply</dt>
        <dd><SupplyStatus alerts={row.alerts} /></dd>
      </dl>
      <Button variant="secondary" aria-label={`Open details for ${medicationTitle(med)}`} onClick={() => onOpen(med)}>
        Details
      </Button>
    </li>
  );
}

/** Medicines as a table (wider screens). */
export function MedicationsTable({ rows, timeZone, onOpen }: { rows: MedRowData[]; timeZone: string; onOpen: (m: Medication) => void }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[44rem] text-left text-sm">
        <caption className="sr-only">Your medicines</caption>
        <thead className="bg-canvas text-xs uppercase tracking-wide text-ink-soft">
          <tr>
            <th scope="col" className="p-3">Medicine</th>
            <th scope="col" className="p-3">Form and dose</th>
            <th scope="col" className="p-3">Source</th>
            <th scope="col" className="p-3">Next dose</th>
            <th scope="col" className="p-3">Supply</th>
            <th scope="col" className="p-3"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.med.id} className="border-t border-line align-top">
              <th scope="row" className="p-3 font-medium text-ink">
                <span className="break-words">{medicationTitle(r.med)}</span>
                {r.med.as_needed && <span className="block text-xs font-normal text-ink-soft">Only when needed</span>}
              </th>
              <td className="p-3 text-ink">{details(r.med) || <span className="text-ink-soft">Not set</span>}</td>
              <td className="p-3">
                <span className="flex flex-wrap items-center gap-1">
                  <BasisBadge med={r.med} />
                  <VerificationBadge status={r.med.verification_status} />
                </span>
              </td>
              <td className="p-3 text-ink"><NextDose next={r.next} timeZone={timeZone} asNeeded={r.med.as_needed} /></td>
              <td className="p-3"><SupplyStatus alerts={r.alerts} /></td>
              <td className="p-3 text-right">
                <Button variant="secondary" aria-label={`Open details for ${medicationTitle(r.med)}`} onClick={() => onOpen(r.med)}>
                  Details
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
