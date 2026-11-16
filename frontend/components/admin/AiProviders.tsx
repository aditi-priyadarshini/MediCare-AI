"use client";

import { useState } from "react";
import { Alert, Button, Card, EmptyState, PageLoading } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { KIND_LABEL, providerState, type LlmProviders, type LlmTestResult } from "@/lib/admin";
import { useAsync } from "@/lib/hooks";

export function AiProviders() {
  const q = useAsync(() => api<LlmProviders>("/admin/llm/providers"));
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, LlmTestResult | string>>({});

  async function test(name: string) {
    setBusy(name);
    try {
      const r = await api<LlmTestResult>(`/admin/llm/providers/${name}/test`, { method: "POST" });
      setResults((prev) => ({ ...prev, [name]: r }));
      await q.reload();
    } catch (e) {
      setResults((prev) => ({ ...prev, [name]: errorMessage(e) }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card aria-labelledby="ai-h" className="space-y-4">
      <div>
        <h2 id="ai-h" className="text-lg font-semibold text-ink">
          AI providers
        </h2>
        <p className="text-sm text-ink-soft">
          The assistant tries these in order and moves to the next if one fails. Each provider that is sent a question
          is recorded in that patient’s data-use log. Keys and models are set on the server (see .env.example) and are
          never shown here. A test sends one fixed message with no patient data.
        </p>
      </div>
      {q.loading && !q.data ? (
        <PageLoading label="Loading providers" />
      ) : !q.data ? (
        <Alert tone="danger" title="Could not load providers">
          {errorMessage(q.error)}
        </Alert>
      ) : !q.data.configured ? (
        <EmptyState title="No AI provider is configured">
          The assistant lists matching records without writing a summary. Set LLM_PROVIDER on the server to turn a
          model on.
        </EmptyState>
      ) : (
        <ol className="space-y-3">
          {q.data.providers.map((p) => {
            const r = results[p.name];
            return (
              <li key={p.name} className="rounded-lg border border-line p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium text-ink">
                    {p.position}. {p.name}
                    <span className="ml-2 text-sm font-normal text-ink-soft">{KIND_LABEL[p.kind] ?? p.kind}</span>
                  </p>
                  <span className="rounded-full bg-mint-100 px-2 py-0.5 text-xs font-medium text-teal-700">
                    {providerState(p)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink">
                  Model {p.model} at {p.host}
                </p>
                <p className="text-xs text-ink-soft">
                  {p.calls} requests, {p.failures} failed
                  {p.last_ok_at ? `, last success ${new Date(p.last_ok_at).toLocaleString()}` : ""}
                  {p.last_error ? `. Last error: ${p.last_error}` : ""}
                </p>
                <div className="mt-2">
                  <Button variant="secondary" loading={busy === p.name} onClick={() => void test(p.name)}>
                    Test {p.name}
                  </Button>
                </div>
                <div role="status" aria-live="polite" className="mt-2 text-sm">
                  {typeof r === "string" ? (
                    <span className="text-danger-700">Test could not run: {r}</span>
                  ) : r ? (
                    r.ok ? (
                      <span className="text-success-700">Reachable ({r.latency_ms} ms).</span>
                    ) : (
                      <span className="text-danger-700">Failed: {r.error}</span>
                    )
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
