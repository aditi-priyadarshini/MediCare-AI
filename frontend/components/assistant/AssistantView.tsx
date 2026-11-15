"use client";

import { Send, Trash2 } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { ContextControls } from "@/components/assistant/ContextControls";
import { EvidenceList } from "@/components/assistant/EvidenceList";
import { Alert, Button, Card, EmptyState, PageLoading } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { MODE_NOTE, splitCitations } from "@/lib/assistant";
import { useAsync } from "@/lib/hooks";
import type {
  AskResult,
  AssistantStatus,
  ChatMessage,
  ChatSessionBrief,
  ChatSessionDetail,
  ContextKey,
} from "@/lib/types";

interface Page<T> {
  items: T[];
}

function AnswerText({ message }: { message: ChatMessage }) {
  // Always plain text: model output is never interpreted as HTML or markdown.
  return (
    <p className="whitespace-pre-wrap text-ink">
      {splitCitations(message.content).map((s, i) =>
        s.kind === "text" ? (
          <Fragment key={i}>{s.text}</Fragment>
        ) : (
          <a
            key={i}
            href={`#ev-${message.id}-${s.ref}`}
            className="mx-0.5 rounded bg-mint-100 px-1 text-xs font-semibold text-teal-700"
            aria-label={`Source ${s.ref}`}
          >
            {s.ref}
          </a>
        ),
      )}
    </p>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const mine = message.role === "user";
  return (
    <div className={mine ? "ml-auto max-w-[85%]" : "mr-auto max-w-[95%]"}>
      <div className={mine ? "rounded-lg bg-teal-700 p-3 text-white" : "rounded-lg border border-line bg-surface p-3"}>
        {mine ? <p className="whitespace-pre-wrap">{message.content}</p> : <AnswerText message={message} />}
      </div>
      {!mine && message.mode && <p className="mt-1 text-xs text-ink-soft">{MODE_NOTE[message.mode]}</p>}
      {!mine && <EvidenceList messageId={message.id} items={message.evidence} />}
    </div>
  );
}

export function AssistantView() {
  const status = useAsync(() => api<AssistantStatus>("/assistant/status"), []);
  const sessions = useAsync(() => api<Page<ChatSessionBrief>>("/assistant/sessions?limit=50"), []);
  const [detail, setDetail] = useState<ChatSessionDetail | null>(null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [detail?.messages.length]);

  async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setFailure(null);
    try {
      return await fn();
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const open = (id: string) =>
    guard(async () => setDetail(await api<ChatSessionDetail>(`/assistant/sessions/${id}`)));

  const create = () =>
    guard(async () => {
      setDetail(await api<ChatSessionDetail>("/assistant/sessions", { method: "POST", body: {} }));
      await sessions.reload();
    });

  const remove = () =>
    detail &&
    window.confirm("Delete this chat and its saved answers? This cannot be undone.") &&
    guard(async () => {
      await api(`/assistant/sessions/${detail.id}`, { method: "DELETE" });
      setDetail(null);
      await sessions.reload();
    });

  const toggle = (key: ContextKey, value: boolean) =>
    detail &&
    guard(async () =>
      setDetail(
        await api<ChatSessionDetail>(`/assistant/sessions/${detail.id}/context`, {
          method: "PATCH",
          body: { [key]: value },
        }),
      ),
    );

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = question.trim();
    if (!detail || !text) return;
    const result = await guard(() =>
      api<AskResult>(`/assistant/sessions/${detail.id}/messages`, { method: "POST", body: { content: text } }),
    );
    if (result) {
      setQuestion("");
      setDetail((d) =>
        d ? { ...d, messages: [...d.messages, result.user_message, result.assistant_message] } : d,
      );
      void sessions.reload();
    }
  }

  if (status.loading || sessions.loading) return <PageLoading label="Loading assistant" />;
  const consent = detail?.consent_granted ?? status.data?.consent_granted ?? false;

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside aria-label="Your chats" className="space-y-3">
        <Button onClick={create} loading={busy && !detail} fullWidth>
          New chat
        </Button>
        <ul className="space-y-1">
          {(sessions.data?.items ?? []).map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => void open(s.id)}
                aria-current={detail?.id === s.id ? "true" : undefined}
                className="min-h-[44px] w-full truncate rounded-lg px-3 text-left text-sm hover:bg-mint-100 aria-[current=true]:bg-mint-100"
              >
                {s.title}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="space-y-4">
        {status.data?.mode === "evidence_only" && (
          <Alert tone="info" title="No AI model is connected">
            The assistant lists matching records and reference notes exactly as recorded.
          </Alert>
        )}
        {failure && <Alert tone="danger" title="Something went wrong">{failure}</Alert>}
        {!detail ? (
          <EmptyState title="Start a chat">
            Ask about your recorded tests, medicines or allergies. Nothing is shared with the assistant until you switch it on.
          </EmptyState>
        ) : (
          <>
            <ContextControls context={detail.context} consentGranted={consent} busy={busy} onChange={toggle} />
            <Card aria-label="Conversation" className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="truncate text-lg font-semibold text-ink">{detail.title}</h2>
                <Button variant="ghost" onClick={remove} aria-label="Delete this chat">
                  <Trash2 className="h-4 w-4" aria-hidden /> Delete
                </Button>
              </div>
              <div className="space-y-4" aria-live="polite">
                {detail.messages.length === 0 && (
                  <EmptyState title="No messages yet">For example: “How has my HbA1c changed?”</EmptyState>
                )}
                {detail.messages.map((m) => (
                  <Bubble key={m.id} message={m} />
                ))}
                <div ref={endRef} />
              </div>
              <form onSubmit={send} className="flex gap-2">
                <label htmlFor="ask" className="sr-only">
                  Your question
                </label>
                <textarea
                  id="ask"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  maxLength={2000}
                  rows={2}
                  placeholder="Ask about your records"
                  className="min-h-[44px] flex-1 rounded-lg border border-line p-2"
                />
                <Button type="submit" loading={busy} disabled={!question.trim()}>
                  <Send className="h-4 w-4" aria-hidden /> Send
                </Button>
              </form>
            </Card>
          </>
        )}
        <p className="text-xs text-ink-soft">
          Information from your recorded data, not medical advice. It can’t diagnose anything or tell you what to take.
          In an emergency call your local emergency number (112 in India).
        </p>
      </div>
    </div>
  );
}
