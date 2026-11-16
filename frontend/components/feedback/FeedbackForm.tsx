"use client";

import { useState } from "react";
import { Alert, Button, Card, EmptyState, SelectField } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { CATEGORY_LABEL, SENDER_STATUS_LABEL, type FeedbackCategory, type FeedbackRow } from "@/lib/admin";
import { useAsync } from "@/lib/hooks";
import type { Page } from "@/lib/types";

const OPTIONS = (Object.keys(CATEGORY_LABEL) as FeedbackCategory[]).map((value) => ({
  value,
  label: CATEGORY_LABEL[value],
}));

export function FeedbackForm() {
  const [category, setCategory] = useState<FeedbackCategory>("general");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const mine = useAsync(() => api<Page<FeedbackRow>>("/feedback?limit=20"));
  const tooShort = message.trim().length < 5;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFailure(null);
    setSent(false);
    try {
      await api("/feedback", { method: "POST", body: { category, message: message.trim() } });
      setMessage("");
      setSent(true);
      await mine.reload();
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Send feedback</h1>
        <p className="mt-1 text-ink-soft">Tell the team what is broken, confusing or missing in this app.</p>
      </div>
      <Alert tone="warning" title="Not for health problems">
        Feedback is read by the app’s team and is not monitored for emergencies. For an emergency call 112. To
        report a reaction to a medicine, use the Safety page. Please do not include health details here.
      </Alert>
      <Card aria-labelledby="fb-form-h">
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <h2 id="fb-form-h" className="sr-only">
            Feedback form
          </h2>
          <SelectField
            label="What is it about?"
            value={category}
            options={OPTIONS}
            onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
          />
          <div className="space-y-1.5">
            <label htmlFor="fb-message" className="block text-sm font-medium text-ink">
              Your message
            </label>
            <textarea
              id="fb-message"
              required
              minLength={5}
              maxLength={2000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              aria-describedby="fb-count"
              className="min-h-[140px] w-full rounded-lg border border-line bg-surface px-3 py-2 text-base"
            />
            <p id="fb-count" className="text-sm text-ink-soft">
              {message.length} of 2000 characters
            </p>
          </div>
          {failure && (
            <Alert tone="danger" title="Not sent">
              {failure}
            </Alert>
          )}
          {sent && (
            <Alert tone="success" title="Thank you">
              Your feedback was sent.
            </Alert>
          )}
          <Button type="submit" loading={busy} disabled={tooShort}>
            Send feedback
          </Button>
        </form>
      </Card>
      <Card aria-labelledby="fb-mine-h" className="space-y-3">
        <h2 id="fb-mine-h" className="text-lg font-semibold text-ink">
          What you have sent
        </h2>
        {!mine.data ? (
          <p className="text-sm text-ink-soft">{mine.loading ? "Loading…" : "Could not load your feedback."}</p>
        ) : mine.data.items.length === 0 ? (
          <EmptyState title="Nothing sent yet" />
        ) : (
          <ul className="space-y-2">
            {mine.data.items.map((f) => (
              <li key={f.id} className="rounded-lg border border-line p-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2 text-ink-soft">
                  <span>{CATEGORY_LABEL[f.category]}</span>
                  <span>
                    {SENDER_STATUS_LABEL[f.status]} · <time dateTime={f.created_at}>{new Date(f.created_at).toLocaleDateString()}</time>
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-ink">{f.message}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
