"use client";

import Link from "next/link";
import { MessagesSquare, ShieldAlert, SlidersHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";
import { Composer } from "@/components/assistant/Composer";
import { ContextPanel } from "@/components/assistant/ContextControls";
import { MessageList } from "@/components/assistant/MessageList";
import { SessionList } from "@/components/assistant/SessionList";
import { ConfirmationDialog, Dialog } from "@/components/ui/Dialog";
import { Drawer } from "@/components/ui/Drawer";
import { ErrorState } from "@/components/ui/ErrorState";
import { Alert, Button, Card, EmptyState, PageLoading } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { assistantErrorKey } from "@/lib/assistant";
import { cn } from "@/lib/cn";
import { useExperience } from "@/lib/experience";
import { useAsync, useMediaQuery } from "@/lib/hooks";
import { Tr, useT } from "@/lib/i18n";
import { useOptionalProfile } from "@/lib/profile-context";
import type {
  AskResult,
  AssistantStatus,
  ChatSessionBrief,
  ChatSessionDetail,
  ContextKey,
  Language,
} from "@/lib/types";

interface Page<T> {
  items: T[];
}

type Busy = "create" | "open" | "send" | "context" | "delete";

/** Always on screen, in the page itself (never in a tooltip), on every viewport. */
function SafetyNotice() {
  return (
    <div role="note" className="flex gap-3 rounded-lg border border-line bg-mint-100 p-3 text-sm text-ink">
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" aria-hidden />
      <div>
        <p>
          <Tr k="assistant.notAdvice" /> <Tr k="assistant.emergency" />
        </p>
        <Link href="/emergency" className="inline-flex min-h-[44px] items-center font-medium underline">
          <Tr k="assistant.safety.urgent.page" />
        </Link>
      </div>
    </div>
  );
}

export function AssistantView() {
  const { t } = useT();
  const { experience } = useExperience();
  const easy = experience === "easy";
  const profile = useOptionalProfile()?.profile;
  const language = (profile?.preferred_language ?? "en") as Language;
  const timeZone = profile?.timezone ?? null;
  const voiceOn = profile?.accessibility_preferences.voice_enabled ?? false;
  const isLg = useMediaQuery("(min-width: 1024px)");
  const isXl = useMediaQuery("(min-width: 1280px)");

  const status = useAsync(() => api<AssistantStatus>("/assistant/status"), []);
  const sessions = useAsync(() => api<Page<ChatSessionBrief>>("/assistant/sessions?limit=50"), []);

  const [detail, setDetail] = useState<ChatSessionDetail | null>(null);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [again, setAgain] = useState<(() => void) | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [chatsOpen, setChatsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  /** Runs one action: marks what is in flight, shows a plain-language error, offers a retry. */
  async function guard<T>(kind: Busy, fn: () => Promise<T>, retryWith?: () => void): Promise<T | undefined> {
    setBusy(kind);
    setFailure(null);
    setAgain(null);
    try {
      return await fn();
    } catch (e) {
      const key = assistantErrorKey(e);
      setFailure(key ? t(key) : errorMessage(e));
      if (retryWith) setAgain(() => retryWith);
    } finally {
      setBusy(null);
    }
    return undefined;
  }

  const open = (id: string) =>
    guard(
      "open",
      async () => setDetail(await api<ChatSessionDetail>(`/assistant/sessions/${id}`)),
      () => void open(id),
    );

  const create = () =>
    guard(
      "create",
      async () => {
        setDetail(await api<ChatSessionDetail>("/assistant/sessions", { method: "POST", body: { language } }));
        await sessions.reload();
      },
      () => void create(),
    );

  async function confirmDelete() {
    if (!detail) return;
    const id = detail.id;
    await guard("delete", async () => {
      await api(`/assistant/sessions/${id}`, { method: "DELETE" });
      setDetail(null);
      setQuestion("");
      await sessions.reload();
    });
    setDeleteOpen(false);
  }

  /** The chat's switches only change after the API accepted the change; nothing is guessed here. */
  const toggle = (key: ContextKey, value: boolean) => {
    if (!detail) return;
    void guard("context", async () =>
      setDetail(
        await api<ChatSessionDetail>(`/assistant/sessions/${detail.id}/context`, {
          method: "PATCH",
          body: { [key]: value },
        }),
      ),
    );
  };

  async function send() {
    const text = question.trim();
    if (!detail || !text || busy) return;
    const id = detail.id;
    setPending(text);
    const result = await guard(
      "send",
      () => api<AskResult>(`/assistant/sessions/${id}/messages`, { method: "POST", body: { content: text } }),
      () => void send(),
    );
    setPending(null);
    if (result) {
      setQuestion("");
      setDetail((d) => (d && d.id === id ? { ...d, messages: [...d.messages, result.user_message, result.assistant_message] } : d));
      void sessions.reload();
    }
  }

  if (sessions.loading && !sessions.data) return <PageLoading label={t("assistant.loading")} />;
  if (sessions.error && !sessions.data) {
    return (
      <ErrorState title={t("assistant.load.error")} onRetry={() => void sessions.reload()} retryLabel={t("assistant.retry")}>
        {errorMessage(sessions.error)}
      </ErrorState>
    );
  }

  const list = sessions.data?.items ?? [];
  const consent = detail?.consent_granted ?? status.data?.consent_granted ?? false;
  const showPanel = isXl && panelOpen && detail !== null;
  const controls = detail && {
    context: detail.context,
    consentGranted: consent,
    busy: busy === "context",
    locked: busy !== null,
    onChange: toggle,
    easy,
  };
  const chats = (
    <SessionList
      sessions={list}
      activeId={detail?.id ?? null}
      busy={busy !== null}
      creating={busy === "create"}
      onOpen={(id) => {
        setChatsOpen(false);
        void open(id);
      }}
      onNew={() => {
        setChatsOpen(false);
        void create();
      }}
    />
  );

  return (
    <div
      className={cn(
        "grid gap-4",
        isLg && !showPanel && "grid-cols-[15rem_minmax(0,1fr)]",
        isLg && showPanel && "grid-cols-[15rem_minmax(0,1fr)_20rem]",
      )}
    >
      {isLg && <aside aria-label={t("assistant.chats")}>{chats}</aside>}

      <div className="min-w-0 space-y-4">
        {status.data?.mode === "evidence_only" && (
          <Alert tone="info" title={t("assistant.status.none.title")}>
            {t("assistant.status.none.body")}
          </Alert>
        )}
        {status.error != null && !status.data && (
          <Alert tone="warning" title={t("assistant.status.error")} />
        )}
        {failure && (
          <Alert tone="danger" title={t("assistant.failure.title")}>
            <p>{failure}</p>
            {again && (
              <Button variant="secondary" className="mt-2" onClick={again}>
                {t("assistant.retry")}
              </Button>
            )}
          </Alert>
        )}

        {!detail ? (
          <>
            <EmptyState
              title={t("assistant.empty.title")}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={() => void create()} loading={busy === "create"} disabled={busy !== null}>
                    {t("assistant.newChat")}
                  </Button>
                  {!isLg && list.length > 0 && (
                    <Button variant="secondary" onClick={() => setChatsOpen(true)}>
                      <MessagesSquare className="h-4 w-4" aria-hidden /> {t("assistant.chats.open")}
                    </Button>
                  )}
                </div>
              }
            >
              {t("assistant.empty.body")}
            </EmptyState>
            <SafetyNotice />
          </>
        ) : (
          <Card aria-label={detail.title} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="min-w-0 truncate text-h3 text-ink">{detail.title}</h2>
              <div className="flex flex-wrap gap-1">
                {!isLg && (
                  <Button variant="ghost" onClick={() => setChatsOpen(true)}>
                    <MessagesSquare className="h-4 w-4" aria-hidden /> {t("assistant.chats.open")}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  aria-expanded={isXl ? panelOpen : undefined}
                  onClick={() => (isXl ? setPanelOpen((o) => !o) : setSheetOpen(true))}
                >
                  <SlidersHorizontal className="h-4 w-4" aria-hidden />{" "}
                  {isXl ? (panelOpen ? t("assistant.panel.hide") : t("assistant.panel.show")) : t("assistant.panel.open")}
                </Button>
                <Button variant="ghost" onClick={() => setDeleteOpen(true)} aria-label={t("assistant.delete.aria")} disabled={busy !== null}>
                  <Trash2 className="h-4 w-4" aria-hidden /> {t("assistant.delete")}
                </Button>
              </div>
            </div>

            {detail.messages.length === 0 && !pending && (
              <EmptyState title={t("assistant.noMessages.title")}>{t("assistant.noMessages.body")}</EmptyState>
            )}
            <MessageList
              key={detail.id}
              messages={detail.messages}
              pending={pending}
              language={language}
              timeZone={timeZone}
              voiceOn={voiceOn}
              easy={easy}
            />
            <SafetyNotice />
            <Composer
              value={question}
              onChange={setQuestion}
              onSend={() => void send()}
              busy={busy !== null}
              sending={busy === "send"}
              context={detail.context}
              language={language}
              voiceOn={voiceOn}
              showPrompts={detail.messages.length === 0 && !pending}
              easy={easy}
            />
          </Card>
        )}
      </div>

      {showPanel && controls && (
        <aside aria-label={t("assistant.panel.open")}>
          <ContextPanel {...controls} />
        </aside>
      )}

      {/* Phones and tablets: the switches open as a sheet from the bottom edge. */}
      <Dialog
        open={sheetOpen && !isXl && controls !== null}
        onClose={() => setSheetOpen(false)}
        title={t("assistant.panel.open")}
        className="max-h-[85vh] overflow-y-auto"
      >
        {controls && <ContextPanel {...controls} />}
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={() => setSheetOpen(false)}>
            {t("assistant.panel.close")}
          </Button>
        </div>
      </Dialog>

      <Drawer
        open={chatsOpen && !isLg}
        onClose={() => setChatsOpen(false)}
        title={t("assistant.chats")}
        closeLabel={t("assistant.panel.close")}
        side="left"
      >
        {chats}
      </Drawer>

      <ConfirmationDialog
        open={deleteOpen}
        destructive
        loading={busy === "delete"}
        title={t("assistant.delete.title")}
        confirmLabel={t("assistant.delete.confirm")}
        cancelLabel={t("assistant.cancel")}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteOpen(false)}
      >
        {t("assistant.delete.body")}
      </ConfirmationDialog>
    </div>
  );
}
