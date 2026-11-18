"use client";

import { FlaskConical, Plus, ScanLine, Search } from "lucide-react";
import { useState } from "react";
import { LabForm } from "@/components/records/LabForm";
import { LabImport } from "@/components/records/LabImport";
import { LabResultCard, LabResultsTable } from "@/components/records/LabResultCard";
import { ScanCapture } from "@/components/records/ScanCapture";
import { TrendChart } from "@/components/records/TrendChart";
import { ConfirmationDialog } from "@/components/ui/Dialog";
import { Drawer } from "@/components/ui/Drawer";
import { ErrorState } from "@/components/ui/ErrorState";
import { useToast } from "@/components/ui/Toast";
import { Alert, Button, Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { TABLE_QUERY, useAsync, useMediaQuery } from "@/lib/hooks";
import { comparableTrend, FLAG_LABEL, formatDate, formatLabValue, NO_COMPARABLE_HISTORY } from "@/lib/records";
import { scanStatus, type ScanResult } from "@/lib/scan";
import type { LabResult, LabTestSummary, LabTrend, Page } from "@/lib/types";

type View = "test" | "all";

function ResultList({ items, showTest, onEdit, onRemove }: { items: LabResult[]; showTest?: boolean; onEdit: (l: LabResult) => void; onRemove: (l: LabResult) => void }) {
  const wide = useMediaQuery(TABLE_QUERY);
  return wide ? (
    <LabResultsTable items={items} showTest={showTest} onEdit={onEdit} onRemove={onRemove} />
  ) : (
    <ul className="divide-y divide-line rounded-lg border border-line">
      {items.map((l) => (
        <LabResultCard key={l.id} l={l} showTest={showTest} onEdit={onEdit} onRemove={onRemove} />
      ))}
    </ul>
  );
}

export function LabsSection() {
  const { show } = useToast();
  const tests = useAsync(() => api<LabTestSummary[]>("/labs/tests"), []);
  const [view, setView] = useState<View>("test");
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<LabResult | null>(null);
  const [adding, setAdding] = useState(false);
  const canScan = useAsync(scanStatus, []); // the button is only shown when this server can read reports
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<{ file: File; result: ScanResult } | null>(null);
  const [removing, setRemoving] = useState<LabResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const name = selected ?? tests.data?.[0]?.test_name ?? null;
  const detail = useAsync(async () => {
    if (!name) return null;
    const q = encodeURIComponent(name);
    const [results, trend] = await Promise.all([
      api<Page<LabResult>>(`/labs?test_name=${q}&limit=100`),
      api<LabTrend>(`/labs/trend?test_name=${q}`).catch(() => null), // 404 when no numeric results
    ]);
    return { results, trend };
  }, [name]);
  const all = useAsync(() => (view === "all" ? api<Page<LabResult>>("/labs?limit=100") : Promise.resolve(null)), [view]);

  async function reloadAll() {
    await Promise.all([tests.reload(), detail.reload(), view === "all" ? all.reload() : Promise.resolve()]);
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    setNotice(null);
    try {
      await api(`/labs/${removing.id}`, { method: "PATCH", body: { status: "entered_in_error" } });
      setRemoving(null);
      setSelected(null);
      show("Result removed.", "success");
      await reloadAll();
    } catch (err) {
      setRemoving(null);
      setNotice(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const comparable = detail.data?.trend && detail.data.results ? comparableTrend(detail.data.trend, detail.data.results.items) : null;
  const chartable = comparable && comparable.trend.points.length >= 2;
  const hasNumeric = Boolean(detail.data?.trend);

  return (
    <div className="space-y-6">
      <Alert tone="info" title="How to read this page">
        Results are compared only with the range printed on your own lab report. MediCare AI does not
        interpret results or tell you whether a value is healthy. Talk to your doctor about what yours mean.
      </Alert>

      <div className="flex flex-wrap justify-end gap-2">
        {canScan.data?.available && (
          <Button variant="secondary" onClick={() => setScanning(true)}>
            <ScanLine className="h-4 w-4" aria-hidden /> Scan a report
          </Button>
        )}
        <Button onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" aria-hidden /> Add result
        </Button>
      </div>

      <Drawer
        open={scanning}
        onClose={() => {
          setScanning(false);
          setScanned(null);
        }}
        title={scanned ? "Check the results" : "Scan a lab report"}
        closeLabel="Close scan"
        className="sm:w-[34rem]"
      >
        {scanned ? (
          <LabImport
            key={scanned.file.name + scanned.file.size}
            scan={scanned.result}
            file={scanned.file}
            onCancel={() => setScanned(null)}
            onDone={async (saved) => {
              setScanning(false);
              setScanned(null);
              if (saved[0]) setSelected(saved[0].test_name);
              show(`${saved.length} result${saved.length === 1 ? "" : "s"} saved.`, "success");
              await reloadAll();
            }}
          />
        ) : (
          <ScanCapture title="Scan a lab report" description="Take a photo of the report or choose a file. The tests, values, units and ranges are read for you to check, then saved together." onScanned={(file, result) => setScanned({ file, result })} />
        )}
      </Drawer>

      <Drawer open={adding} onClose={() => setAdding(false)} title="Add a result" closeLabel="Close add result" className="sm:w-[28rem]">
        <LabForm
          onCancel={() => setAdding(false)}
          onSaved={async (f) => {
            setAdding(false);
            setSelected(f.test_name.trim());
            show("Result saved.", "success");
            await reloadAll();
          }}
        />
      </Drawer>

      {notice && <Alert tone="danger">{notice}</Alert>}

      <Card aria-labelledby="your-labs">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="your-labs" className="text-h3 font-semibold text-navy-900">
            Your tests
          </h2>
          <div role="group" aria-label="View" className="inline-flex rounded-lg border border-line p-0.5">
            {([["test", "By test"], ["all", "All results"]] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`min-h-control rounded-md px-3 text-sm font-medium ${view === v ? "bg-mint-100 text-teal-700" : "text-ink-soft hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {tests.error && !tests.data ? (
          <ErrorState title="Couldn’t load your tests" onRetry={() => void tests.reload()}>{errorMessage(tests.error)}</ErrorState>
        ) : tests.loading && !tests.data ? (
          <div className="space-y-2" role="status" aria-label="Loading tests"><Skeleton variant="row" /><Skeleton variant="row" /></div>
        ) : !tests.data || tests.data.length === 0 ? (
          <EmptyState title="No results yet" icon={FlaskConical}>Add a result above to start tracking a test over time.</EmptyState>
        ) : view === "all" ? (
          all.error && !all.data ? (
            <ErrorState title="Couldn’t load results" onRetry={() => void all.reload()}>{errorMessage(all.error)}</ErrorState>
          ) : all.loading && !all.data ? (
            <Skeleton className="h-40 w-full" />
          ) : all.data ? (
            <>
              <ResultList
                showTest
                items={[...all.data.items].sort((a, b) => a.test_name.localeCompare(b.test_name) || b.observed_on.localeCompare(a.observed_on))}
                onEdit={setEditing}
                onRemove={setRemoving}
              />
              <p role="status" className="mt-3 text-xs text-ink-soft tnum">
                {all.data.items.length} result{all.data.items.length === 1 ? "" : "s"} shown, grouped by test.
                {all.data.total > all.data.items.length && ` Only the newest ${all.data.items.length} of ${all.data.total} are loaded.`}
              </p>
            </>
          ) : null
        ) : (
          <div className="grid gap-4 lg:grid-cols-[280px_1fr] lg:gap-6">
            <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
              {tests.data.length > 6 && (
                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden />
                  <input
                    type="search"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder={`Search ${tests.data.length} tests`}
                    aria-label="Search tests"
                    className="min-h-control w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm text-ink placeholder:text-ink-soft focus:border-teal-700 focus:outline-none"
                  />
                </div>
              )}
              {(() => {
                const q = filter.trim().toLowerCase();
                const shown = q ? tests.data.filter((t) => t.test_name.toLowerCase().includes(q)) : tests.data;
                return (
                  <ul
                    aria-label="Tests"
                    tabIndex={0}
                    className="max-h-72 divide-y divide-line overflow-y-auto overscroll-contain rounded-lg border border-line lg:max-h-[calc(100vh-14rem)]"
                  >
                    {shown.length === 0 && <li className="p-3 text-sm text-ink-soft">No tests match “{filter}”.</li>}
                    {shown.map((t) => {
                      const active = t.test_name === name;
                      return (
                        <li key={t.test_name}>
                          <button
                            type="button"
                            aria-pressed={active}
                            onClick={() => setSelected(t.test_name)}
                            className={`flex min-h-[44px] w-full flex-col justify-center border-l-4 px-3 py-1.5 text-left ${active ? "border-teal-700 bg-mint-100" : "border-transparent hover:bg-mint-100"}`}
                          >
                            <span className="truncate text-sm font-medium text-ink">{t.test_name}</span>
                            <span className="truncate text-xs text-ink-soft tnum">
                              {formatLabValue({ value_numeric: t.latest_value_numeric, value_text: t.latest_value_text, unit: t.latest_unit })}
                              {" · "}
                              {FLAG_LABEL[t.latest_flag]}
                              {t.count > 1 && ` · ${t.count} results`}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                );
              })()}
            </div>

            <div aria-live="polite" className="min-w-0 space-y-4">
              {detail.error && !detail.data ? (
                <ErrorState title="Couldn’t load this test" onRetry={() => void detail.reload()}>{errorMessage(detail.error)}</ErrorState>
              ) : detail.loading && !detail.data ? (
                <Skeleton className="h-48 w-full" />
              ) : detail.data ? (
                <>
                  <h3 className="text-h3 font-semibold text-navy-900">{name}</h3>
                  {chartable ? (
                    <TrendChart trend={comparable.trend} />
                  ) : hasNumeric ? (
                    <p className="rounded-lg border border-dashed border-line p-3 text-sm text-ink-soft">
                      {NO_COMPARABLE_HISTORY} A trend needs at least two results of this test in the same unit.
                    </p>
                  ) : (
                    <p className="text-sm text-ink-soft">Results for this test aren’t numbers, so there is nothing to chart.</p>
                  )}
                  {comparable && comparable.excluded > 0 && (
                    <Alert tone="warning" title="Some results are not charted">
                      {comparable.excluded} result{comparable.excluded === 1 ? " uses" : "s use"} a different unit from the newest one, so {comparable.excluded === 1 ? "it is" : "they are"} listed below but not drawn on the same chart.
                    </Alert>
                  )}
                  <ResultList items={detail.data.results.items} onEdit={setEditing} onRemove={setRemoving} />
                </>
              ) : null}
            </div>
          </div>
        )}
      </Card>

      <Drawer open={editing !== null} onClose={() => setEditing(null)} title="Edit result" closeLabel="Close editor" className="sm:w-[28rem]">
        {editing && (
          <LabForm
            key={editing.id}
            initial={editing}
            onCancel={() => setEditing(null)}
            onSaved={async () => {
              setEditing(null);
              show("Result updated.", "success");
              await reloadAll();
            }}
          />
        )}
      </Drawer>

      <ConfirmationDialog
        open={removing !== null}
        destructive
        loading={busy}
        title={removing ? `Remove ${removing.test_name} from ${formatDate(removing.observed_on)}?` : ""}
        confirmLabel="Remove result"
        onCancel={() => setRemoving(null)}
        onConfirm={() => void remove()}
      >
        It will be hidden from your list and charts and marked “entered in error”. It is not erased.
      </ConfirmationDialog>
    </div>
  );
}
