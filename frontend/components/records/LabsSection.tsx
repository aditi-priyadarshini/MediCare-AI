"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Skeleton,
  TextField,
  VerificationBadge,
} from "@/components/ui/primitives";
import { TrendChart } from "@/components/records/TrendChart";
import { api, errorMessage, fieldErrors } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks";
import { FLAG_LABEL, formatDate, formatLabValue, formatRange, parseNumber, todayISO } from "@/lib/records";
import type { LabResult, LabTestSummary, LabTrend, Page } from "@/lib/types";

const empty = { test_name: "", result: "", unit: "", ref_low: "", ref_high: "", observed_on: todayISO() };

export function LabsSection() {
  const tests = useAsync(() => api<LabTestSummary[]>("/labs/tests"), []);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const set = <K extends keyof typeof form>(k: K, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function reloadAll() {
    await Promise.all([tests.reload(), detail.reload()]);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    const numeric = parseNumber(form.result);
    const low = parseNumber(form.ref_low);
    const high = parseNumber(form.ref_high);
    if (!form.test_name.trim()) next.test_name = "Enter the test name.";
    if (!form.result.trim()) next.result = "Enter the result.";
    if (Number.isNaN(low)) next.ref_low = "Enter a number.";
    if (Number.isNaN(high)) next.ref_high = "Enter a number.";
    if (low !== null && high !== null && low > high) next.ref_low = "Low can’t be above high.";
    if (!form.observed_on) next.observed_on = "Choose the test date.";
    setErrors(next);
    setNotice(null);
    if (Object.keys(next).length) return;

    // A number is stored as a number (so it can be charted); anything else, such as "Positive", as text.
    const isNumber = numeric !== null && !Number.isNaN(numeric);
    setBusy(true);
    try {
      await api<LabResult>("/labs", {
        method: "POST",
        body: {
          test_name: form.test_name.trim(),
          value_numeric: isNumber ? numeric : null,
          value_text: isNumber ? null : form.result.trim(),
          unit: form.unit.trim() || null,
          ref_low: isNumber ? low : null,
          ref_high: isNumber ? high : null,
          observed_on: form.observed_on,
        },
      });
      setSelected(form.test_name.trim());
      setForm({ ...empty, observed_on: form.observed_on });
      await reloadAll();
    } catch (err) {
      setErrors(fieldErrors(err));
      setNotice(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function archive(id: string) {
    setNotice(null);
    try {
      await api(`/labs/${id}`, { method: "PATCH", body: { status: "entered_in_error" } });
      setSelected(null);
      await reloadAll();
    } catch (err) {
      setNotice(errorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <Alert tone="info" title="How to read this page">
        Results are compared only with the range printed on your own lab report. MediCare AI does not
        interpret results or tell you whether a value is healthy. Talk to your doctor about what yours mean.
      </Alert>

      <Card aria-labelledby="add-lab">
        <h2 id="add-lab" className="mb-4 font-semibold text-navy-900">
          Add a result
        </h2>
        <form onSubmit={(e) => void add(e)} noValidate className="grid gap-4 sm:grid-cols-3">
          <TextField label="Test" value={form.test_name} onChange={(e) => set("test_name", e.target.value)} error={errors.test_name} maxLength={120} hint="For example: Hemoglobin" />
          <TextField label="Result" value={form.result} onChange={(e) => set("result", e.target.value)} error={errors.result ?? errors.value_numeric} hint="A number, or words like “Negative”" maxLength={200} />
          <TextField label="Unit" optional value={form.unit} onChange={(e) => set("unit", e.target.value)} maxLength={32} />
          <TextField label="Report range, low" optional inputMode="decimal" value={form.ref_low} onChange={(e) => set("ref_low", e.target.value)} error={errors.ref_low} />
          <TextField label="Report range, high" optional inputMode="decimal" value={form.ref_high} onChange={(e) => set("ref_high", e.target.value)} error={errors.ref_high} />
          <TextField label="Test date" type="date" max={todayISO()} value={form.observed_on} onChange={(e) => set("observed_on", e.target.value)} error={errors.observed_on} />
          <div className="sm:col-span-3">
            <Button type="submit" loading={busy}>
              <Plus className="h-4 w-4" aria-hidden /> Save result
            </Button>
          </div>
        </form>
      </Card>

      {notice && <Alert tone="danger">{notice}</Alert>}

      <Card aria-labelledby="your-labs">
        <h2 id="your-labs" className="mb-4 font-semibold text-navy-900">
          Your tests
        </h2>
        {tests.error ? (
          <Alert tone="danger">{errorMessage(tests.error)}</Alert>
        ) : tests.loading && !tests.data ? (
          <Skeleton className="h-20 w-full" />
        ) : tests.data && tests.data.length > 0 ? (
          <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
            <ul aria-label="Tests" className="space-y-1">
              {tests.data.map((t) => {
                const active = t.test_name === name;
                return (
                  <li key={t.test_name}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelected(t.test_name)}
                      className={`w-full min-h-[56px] rounded-lg border px-3 py-2 text-left ${
                        active ? "border-teal-700 bg-mint-100" : "border-line hover:bg-mint-100"
                      }`}
                    >
                      <span className="block font-medium text-ink">{t.test_name}</span>
                      <span className="block text-xs text-ink-soft">
                        {formatLabValue({ value_numeric: t.latest_value_numeric, value_text: t.latest_value_text, unit: t.latest_unit })}
                        {" · "}
                        {FLAG_LABEL[t.latest_flag]}
                        {" · "}
                        {t.count} result{t.count === 1 ? "" : "s"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div aria-live="polite" className="min-w-0 space-y-4">
              {detail.loading && !detail.data ? (
                <Skeleton className="h-48 w-full" />
              ) : detail.data ? (
                <>
                  <h3 className="font-semibold text-navy-900">{name}</h3>
                  {detail.data.trend ? (
                    <TrendChart trend={detail.data.trend} />
                  ) : (
                    <p className="text-sm text-ink-soft">Results for this test aren’t numbers, so there is nothing to chart.</p>
                  )}
                  <ul className="divide-y divide-line rounded-lg border border-line">
                    {detail.data.results.items.map((l) => (
                      <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                        <div>
                          <p className="font-medium tabular-nums text-ink">{formatLabValue(l)}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                            <span>{formatDate(l.observed_on)}</span>
                            <span>{FLAG_LABEL[l.flag]}</span>
                            {formatRange(l.ref_low, l.ref_high, l.unit) && (
                              <span>Range {formatRange(l.ref_low, l.ref_high, l.unit)}</span>
                            )}
                            <VerificationBadge status={l.verification_status} />
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          aria-label={`Remove ${l.test_name} result from ${formatDate(l.observed_on)}`}
                          onClick={() => void archive(l.id)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden /> Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          </div>
        ) : (
          <EmptyState title="No results yet">Add a result above to start tracking a test over time.</EmptyState>
        )}
      </Card>
    </div>
  );
}
