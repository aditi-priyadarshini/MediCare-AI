"use client";

import { useState } from "react";
import { RuleForm } from "@/components/admin/RuleForm";
import { Alert, Button, Card, EmptyState, PageLoading, SelectField } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { canReview, reviewLabel, RULE_KIND_LABEL, type AdminIngredient, type AdminRule, type AdminSource } from "@/lib/admin";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/cn";
import { useAsync } from "@/lib/hooks";
import type { Page } from "@/lib/types";

function History({ id, names }: { id: string; names: (i: string) => string }) {
  const h = useAsync(() => api<AdminRule[]>(`/admin/safety-rules/${id}/history`), [id]);
  if (!h.data) return <p className="text-sm text-ink-soft">{h.loading ? "Loading history…" : "Could not load history."}</p>;
  return (
    <ol className="space-y-1 text-sm">
      {h.data.map((r) => (
        <li key={r.id}>
          <span className="font-medium">Version {r.version}</span>, {r.severity}, {r.status === "active" ? "current" : "replaced"};
          written <time dateTime={r.created_at}>{new Date(r.created_at).toLocaleDateString()}</time>
          {r.retired_at ? `, ended ${new Date(r.retired_at).toLocaleDateString()}` : ""}. {names(r.ingredient_id)}
        </li>
      ))}
    </ol>
  );
}

export function RulesManager() {
  const { user: me } = useAuth();
  const [status, setStatus] = useState("active");
  const rules = useAsync(() => api<Page<AdminRule>>(`/admin/safety-rules?status=${status}&limit=100`), [status]);
  const refs = useAsync(async () => {
    const [i, s] = await Promise.all([
      api<Page<AdminIngredient>>("/admin/ingredients?limit=100"),
      api<Page<AdminSource>>("/admin/sources?limit=100"),
    ]);
    return { ingredients: i.items, sources: s.items };
  });
  const [form, setForm] = useState<{ replacing?: AdminRule } | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  const [retiring, setRetiring] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const ingName = (id: string) => refs.data?.ingredients.find((i) => i.id === id)?.name ?? id.slice(0, 8);
  const srcName = (id: string) => refs.data?.sources.find((s) => s.id === id)?.name ?? id.slice(0, 8);

  async function act(rule: AdminRule, action: "review" | "retire") {
    setBusy(rule.id);
    setFailure(null);
    try {
      await api(`/admin/safety-rules/${rule.id}/${action}`, { method: "POST" });
      setRetiring(null);
      await rules.reload();
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card aria-labelledby="rules-h" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="rules-h" className="text-lg font-semibold text-ink">Safety rules</h2>
          <p className="text-sm text-ink-soft">
            Rules are never edited. A change is a new version that replaces the old one, which stays on record. A rule
            should be reviewed by a different administrator from the one who wrote it.
          </p>
        </div>
        {!form && refs.data && (
          <Button onClick={() => setForm({})}>Add a rule</Button>
        )}
      </div>

      {form && refs.data && (
        <RuleForm
          ingredients={refs.data.ingredients}
          sources={refs.data.sources}
          replacing={form.replacing}
          onCancel={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            void rules.reload();
          }}
        />
      )}

      <SelectField
        label="Show"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        options={[
          { value: "active", label: "Current rules" },
          { value: "retired", label: "Replaced or retired" },
          { value: "all", label: "Everything" },
        ]}
      />
      {failure && (
        <Alert tone="danger" title="Not changed">
          {failure}
        </Alert>
      )}

      {rules.loading && !rules.data ? (
        <PageLoading label="Loading rules" />
      ) : !rules.data ? (
        <Alert tone="danger" title="Could not load rules">{errorMessage(rules.error)}</Alert>
      ) : rules.data.items.length === 0 ? (
        <EmptyState title="No rules" />
      ) : (
        <ul className="space-y-3">
          {rules.data.items.map((r) => (
            <li key={r.id} className="rounded-lg border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-medium text-ink">
                  {ingName(r.ingredient_id)} + {r.counterpart_ingredient_id ? ingName(r.counterpart_ingredient_id) : r.counterpart_term}
                  <span className="ml-2 text-sm font-normal text-ink-soft">{RULE_KIND_LABEL[r.kind]}</span>
                </p>
                <span className="rounded-full bg-mint-100 px-2 py-0.5 text-xs font-medium text-teal-700">{r.severity}</span>
              </div>
              <p className="mt-1 text-sm text-ink">{r.description}</p>
              <p className="mt-1 text-xs text-ink-soft">
                {srcName(r.source_id)} {r.source_version}, {r.jurisdiction}, source reviewed {r.reviewed_at}. Version {r.version}.
              </p>
              <p className={cn("mt-1 text-sm font-medium", r.status === "active" && r.review_status !== "approved" ? "text-amber-600" : "text-ink-soft")}>
                {reviewLabel(r)}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {me && canReview(r, me.id) && (
                  <Button loading={busy === r.id} onClick={() => void act(r, "review")}>
                    Approve as second reviewer
                  </Button>
                )}
                {r.status === "active" && (
                  <Button variant="secondary" onClick={() => refs.data && setForm({ replacing: r })}>
                    Write a new version
                  </Button>
                )}
                <Button variant="secondary" aria-expanded={history === r.id} onClick={() => setHistory(history === r.id ? null : r.id)}>
                  {history === r.id ? "Hide history" : "Version history"}
                </Button>
                {r.status === "active" &&
                  (retiring === r.id ? (
                    <>
                      <Button variant="danger" loading={busy === r.id} onClick={() => void act(r, "retire")}>
                        Yes, retire this rule
                      </Button>
                      <Button variant="ghost" onClick={() => setRetiring(null)}>Keep it</Button>
                    </>
                  ) : (
                    <Button variant="secondary" onClick={() => setRetiring(r.id)}>Retire</Button>
                  ))}
              </div>
              {history === r.id && (
                <div className="mt-3 border-t border-line pt-3">
                  <History id={r.id} names={ingName} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
