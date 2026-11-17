"use client";

import { Schedules } from "@/components/medications/Schedules";
import { Supplies } from "@/components/medications/Supplies";
import { BASIS_LABEL } from "@/lib/medications";
import type { Medication } from "@/lib/types";

/**
 * What a medicine is, how and when it is taken, and what is on hand. The instructions are the text
 * you copied from the label or prescription; the reason is your own note. They are shown apart so
 * a note of yours is never read as a prescriber’s instruction.
 */
export function MedicationDetails({ med, onChange }: { med: Medication; onChange: () => void }) {
  return (
    <div className="space-y-6">
      <section aria-label="About this medicine" className="space-y-2">
        <h4 className="text-sm font-semibold text-navy-900">About</h4>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-ink-soft">Source</dt>
          <dd className="text-ink">{BASIS_LABEL[med.basis]}</dd>
          {med.dose_text && (
            <>
              <dt className="text-ink-soft">Dose</dt>
              <dd className="break-words text-ink">{med.dose_text}</dd>
            </>
          )}
          <dt className="text-ink-soft">Per dose</dt>
          <dd className="text-ink tnum">{med.units_per_dose}</dd>
          <dt className="text-ink-soft">Instructions</dt>
          <dd className="break-words text-ink">
            {med.instructions ?? "None entered"}
            {med.instructions && (
              <span className="block text-xs text-ink-soft">
                {med.basis === "prescribed" ? "As you entered them from the prescription." : "As you entered them."}
              </span>
            )}
          </dd>
          <dt className="text-ink-soft">Your note</dt>
          <dd className="break-words text-ink">{med.reason ? `For ${med.reason}` : "None"}</dd>
        </dl>
      </section>
      <Schedules med={med} onChange={onChange} />
      <Supplies med={med} onChange={onChange} />
    </div>
  );
}
