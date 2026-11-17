"use client";

import { Pill, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { MedicationDetails } from "@/components/medications/MedicationDetails";
import { MedicationCard, MedicationsTable, type MedRowData } from "@/components/medications/MedicationCard";
import { ConfirmationDialog } from "@/components/ui/Dialog";
import { Drawer } from "@/components/ui/Drawer";
import { ErrorState } from "@/components/ui/ErrorState";
import { useToast } from "@/components/ui/Toast";
import { Alert, Button, Card, EmptyState, Skeleton, VerificationBadge } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { TABLE_QUERY, useMediaQuery, type AsyncState } from "@/lib/hooks";
import { alertsFor, medicationTitle, medsForTab, nextPendingDose, type MedTab } from "@/lib/medications";
import { useProfile } from "@/lib/profile-context";
import type { Dose, MedAlert, Medication, Page } from "@/lib/types";

const TABS: Array<{ id: MedTab; label: string }> = [
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
  { id: "completed", label: "Completed" },
];

const EMPTY: Record<MedTab, { title: string; hint: string }> = {
  active: { title: "No active medicines", hint: "Add a medicine to set up reminders." },
  paused: { title: "Nothing paused", hint: "Medicines you pause are listed here, and you can resume them." },
  completed: { title: "Nothing completed", hint: "Medicines you stop are kept here so your history stays complete." },
};

/** Tabs with counts. A plain button group (not role=tab) because the panel below is one shared list. */
function TabBar({ tab, counts, onChange }: { tab: MedTab; counts: Record<MedTab, number>; onChange: (t: MedTab) => void }) {
  return (
    <div role="group" aria-label="Medicine status" className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-pressed={tab === t.id}
          onClick={() => onChange(t.id)}
          className={`min-h-control whitespace-nowrap border-b-2 px-4 text-sm font-medium ${tab === t.id ? "border-teal-700 text-teal-700" : "border-transparent text-ink-soft hover:text-ink"}`}
        >
          {t.label} <span className="tnum text-ink-soft">({counts[t.id]})</span>
        </button>
      ))}
    </div>
  );
}

/** Status changes for one medicine. Stopping asks first: it moves the medicine to Completed. */
function MedicationDrawerBody({ med, onChange, onClose }: { med: Medication; onChange: () => void; onClose: () => void }) {
  const { show } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);

  async function setStatus(status: Medication["status"], done: string) {
    setBusy(true);
    setError(null);
    try {
      await api<Medication>(`/medications/${med.id}`, { method: "PATCH", body: { status } });
      show(done, "success");
      onChange();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
        <VerificationBadge status={med.verification_status} />
        <span className="capitalize">{med.status === "stopped" ? "completed" : med.status}</span>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        {med.status === "active" && (
          <Button variant="secondary" disabled={busy} onClick={() => void setStatus("paused", "Medicine paused.")}>
            Pause
          </Button>
        )}
        {med.status !== "active" && (
          <Button variant="secondary" disabled={busy} onClick={() => void setStatus("active", "Medicine resumed.")}>
            Resume
          </Button>
        )}
        {med.status !== "stopped" && (
          <Button variant="ghost" disabled={busy} onClick={() => setConfirmStop(true)}>
            Stop
          </Button>
        )}
      </div>
      <MedicationDetails med={med} onChange={onChange} />
      <ConfirmationDialog
        open={confirmStop}
        destructive
        loading={busy}
        title={`Stop ${medicationTitle(med)}?`}
        confirmLabel="Stop medicine"
        onCancel={() => setConfirmStop(false)}
        onConfirm={() =>
          void setStatus("stopped", "Medicine stopped.").then((ok) => {
            setConfirmStop(false);
            if (ok) onClose();
          })
        }
      >
        It moves to Completed and stops giving reminders. You can resume it later from there. Stopping here only updates this list; it is not medical advice.
      </ConfirmationDialog>
    </div>
  );
}

export function MedicationsCard({
  meds,
  doses,
  alerts,
  onChange,
  onAdd,
}: {
  meds: AsyncState<Page<Medication>>;
  doses: AsyncState<Page<Dose>>;
  alerts: AsyncState<MedAlert[]>;
  onChange: () => void;
  onAdd: () => void;
}) {
  const { profile } = useProfile();
  const wide = useMediaQuery(TABLE_QUERY);
  const [tab, setTab] = useState<MedTab>("active");
  const [openId, setOpenId] = useState<string | null>(null);

  const items = useMemo(() => (meds.data?.items ?? []).filter((m) => m.status !== "entered_in_error"), [meds.data]);
  const counts = { active: medsForTab(items, "active").length, paused: medsForTab(items, "paused").length, completed: medsForTab(items, "completed").length };
  const rows: MedRowData[] = medsForTab(items, tab).map((med) => ({
    med,
    next: doses.data ? nextPendingDose(doses.data.items, med.id) : null,
    alerts: alerts.data ? alertsFor(alerts.data, med.id) : [],
  }));
  const open = openId ? (items.find((m) => m.id === openId) ?? null) : null;
  const tz = profile.timezone;

  return (
    <Card aria-labelledby="your-medications">
      <h2 id="your-medications" className="mb-4 text-h3 font-semibold text-navy-900">
        Your medicines
      </h2>
      {meds.error && !meds.data ? (
        <ErrorState title="Couldn’t load your medicines" onRetry={() => void meds.reload()}>{errorMessage(meds.error)}</ErrorState>
      ) : meds.loading && !meds.data ? (
        <div className="space-y-2" role="status" aria-label="Loading medicines"><Skeleton variant="row" /><Skeleton variant="row" /></div>
      ) : (
        <>
          <TabBar tab={tab} counts={counts} onChange={setTab} />
          {rows.length === 0 ? (
            <EmptyState
              title={EMPTY[tab].title}
              icon={Pill}
              action={
                tab === "active" ? (
                  <Button onClick={onAdd}>
                    <Plus className="h-4 w-4" aria-hidden /> Add medicine
                  </Button>
                ) : undefined
              }
            >
              {EMPTY[tab].hint}
            </EmptyState>
          ) : wide ? (
            <MedicationsTable rows={rows} timeZone={tz} onOpen={(m) => setOpenId(m.id)} />
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {rows.map((r) => (
                <MedicationCard key={r.med.id} row={r} timeZone={tz} onOpen={(m) => setOpenId(m.id)} />
              ))}
            </ul>
          )}
          {(doses.error || alerts.error) && (
            <p className="mt-3 text-xs text-ink-soft">
              {doses.error ? "Next-dose times couldn’t be loaded. " : ""}
              {alerts.error ? "Supply alerts couldn’t be loaded." : ""}
            </p>
          )}
          <p className="mt-3 text-xs text-ink-soft">
            Next dose looks 2 days ahead. MediCare AI keeps track of what you tell it; it doesn’t check doses or interactions, so follow your doctor’s and pharmacist’s advice.
          </p>
        </>
      )}

      <Drawer open={open !== null} onClose={() => setOpenId(null)} title={open ? medicationTitle(open) : "Medicine"} closeLabel="Close medicine details" className="sm:w-[30rem]">
        {open && <MedicationDrawerBody key={open.id} med={open} onChange={onChange} onClose={() => setOpenId(null)} />}
      </Drawer>
    </Card>
  );
}
