"use client";

import Link from "next/link";
import { ArrowDown, Check, Copy, Phone } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { AnswerModeBadge } from "@/components/assistant/AnswerModeBadge";
import { EvidenceList } from "@/components/assistant/EvidenceList";
import { Alert, Button, Skeleton } from "@/components/ui/primitives";
import { ReadAloudButton } from "@/components/voice/ReadAloudButton";
import { copyableAnswer, formatMessageTime, isNearBottom, safetyFraming, splitCitations } from "@/lib/assistant";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import { scriptLanguage, speakableAnswer } from "@/lib/speech";
import type { ChatMessage, Language } from "@/lib/types";

interface BubbleProps {
  message: ChatMessage;
  language: Language;
  timeZone: string | null;
  voiceOn: boolean;
  easy: boolean;
}

/** Plain text only: model output is never interpreted as HTML or markdown. */
function AnswerText({ message, onCite }: { message: ChatMessage; onCite: (ref: string) => void }) {
  const { t } = useT();
  // A marker only becomes a link when the API returned evidence with that reference.
  const known = new Set(message.evidence.map((e) => e.ref));
  return (
    <p className="whitespace-pre-wrap text-ink">
      {splitCitations(message.content).map((s, i) =>
        s.kind === "text" ? (
          <Fragment key={i}>{s.text}</Fragment>
        ) : known.has(s.ref) ? (
          <button
            key={i}
            type="button"
            onClick={() => onCite(s.ref)}
            aria-label={t("assistant.evidence.source", { ref: s.ref })}
            className="mx-0.5 inline-flex min-h-[24px] min-w-[24px] items-center justify-center rounded bg-mint-100 px-1 text-xs font-semibold text-teal-700 underline-offset-2 hover:underline"
          >
            {s.ref}
          </button>
        ) : (
          <Fragment key={i}>{`[${s.ref}]`}</Fragment>
        ),
      )}
    </p>
  );
}

function UrgentNotice() {
  const { t } = useT();
  return (
    <Alert tone="danger" title={t("assistant.safety.urgent.title")} className="mt-2">
      <p>{t("assistant.safety.urgent.body")}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <a
          href="tel:112"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-danger-700 px-4 font-semibold text-white"
        >
          <Phone className="h-4 w-4" aria-hidden /> {t("cmd.call112")}
        </a>
        <Link href="/emergency" className="inline-flex min-h-[44px] items-center rounded-lg border border-line bg-surface px-4 font-semibold text-ink">
          {t("assistant.safety.urgent.page")}
        </Link>
      </div>
    </Alert>
  );
}

function CopyButton({ text }: { text: string }) {
  const { t } = useT();
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 3000);
  }

  return (
    <div>
      <Button variant="ghost" onClick={() => void copy()}>
        {state === "copied" ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
        {t("assistant.copy")}
      </Button>
      <p role="status" aria-live="polite" className="text-xs text-ink-soft">
        {state === "copied" ? t("assistant.copied") : state === "failed" ? t("assistant.copyFailed") : ""}
      </p>
    </div>
  );
}

function Bubble({ message, language, timeZone, voiceOn, easy }: BubbleProps) {
  const { t } = useT();
  const mine = message.role === "user";
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const spoken = speakableAnswer(message.content);
  const framing = mine ? null : safetyFraming(message.safety_classification);
  const text = easy ? "text-lg" : "text-base";

  function cite(ref: string) {
    setEvidenceOpen(true);
    // Wait for the list to expand, then move focus to the source that was cited.
    setTimeout(() => document.getElementById(`ev-${message.id}-${ref}`)?.focus(), 0);
  }

  return (
    <article className={cn("w-full", mine ? "ml-auto max-w-[85%]" : "mr-auto max-w-[95%]")} aria-label={mine ? t("assistant.you") : t("assistant.name")}>
      <header className={cn("mb-1 flex items-baseline gap-2 text-xs text-ink-soft", mine && "justify-end")}>
        <span className="font-semibold text-ink">{mine ? t("assistant.you") : t("assistant.name")}</span>
        <time dateTime={message.created_at}>{formatMessageTime(message.created_at, timeZone, language)}</time>
      </header>
      <div
        className={cn(
          "rounded-lg p-3",
          text,
          mine ? "bg-teal-700 text-white" : "border border-lavender-100 border-l-4 border-l-lavender-700 bg-surface",
        )}
      >
        {mine ? <p className="whitespace-pre-wrap">{message.content}</p> : <AnswerText message={message} onCite={cite} />}
      </div>
      {!mine && (
        <>
          {framing === "urgent" && <UrgentNotice />}
          {framing === "no_diagnosis" && <p className="mt-2 text-sm text-ink">{t("assistant.safety.noDiagnosis")}</p>}
          {framing === "no_treatment" && <p className="mt-2 text-sm text-ink">{t("assistant.safety.noTreatment")}</p>}
          <AnswerModeBadge message={message} />
          <div className="mt-1 flex flex-wrap items-start gap-1">
            <CopyButton text={copyableAnswer(message)} />
            {voiceOn && <ReadAloudButton text={spoken} language={scriptLanguage(spoken)} />}
          </div>
          <EvidenceList messageId={message.id} items={message.evidence} open={evidenceOpen} onToggle={setEvidenceOpen} />
        </>
      )}
    </article>
  );
}

interface ListProps {
  messages: ChatMessage[];
  /** The question that has been sent and is waiting for an answer, if any. */
  pending: string | null;
  language: Language;
  timeZone: string | null;
  voiceOn: boolean;
  easy: boolean;
}

/**
 * The conversation as a polite live log. It follows new messages only while the reader is already
 * at the bottom; if they have scrolled up it leaves them there and offers a "new message" button.
 * There is no streaming and no typing animation: while waiting it shows a plain working state.
 */
export function MessageList({ messages, pending, language, timeZone, voiceOn, easy }: ListProps) {
  const { t } = useT();
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const seen = useRef(messages.length);
  const [unseen, setUnseen] = useState(false);

  const toBottom = () => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  // Sending a question always brings the reader to the bottom.
  useEffect(() => {
    if (pending) {
      stick.current = true;
      toBottom();
    }
  }, [pending]);

  useEffect(() => {
    const grew = messages.length > seen.current;
    seen.current = messages.length;
    if (stick.current) toBottom();
    else if (grew) setUnseen(true);
  }, [messages.length]);

  function onScroll() {
    const el = box.current;
    if (!el) return;
    stick.current = isNearBottom(el);
    if (stick.current) setUnseen(false);
  }

  return (
    <div className="relative">
      <div
        ref={box}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={t("assistant.log")}
        tabIndex={0}
        onScroll={onScroll}
        className="max-h-[55vh] space-y-4 overflow-y-auto pr-1"
      >
        {messages.map((m) => (
          <Bubble key={m.id} message={m} language={language} timeZone={timeZone} voiceOn={voiceOn} easy={easy} />
        ))}
        {pending && (
          <>
            <article className="ml-auto w-full max-w-[85%] opacity-80" aria-label={t("assistant.you")}>
              <div className={cn("rounded-lg bg-teal-700 p-3 text-white", easy ? "text-lg" : "text-base")}>
                <p className="whitespace-pre-wrap">{pending}</p>
              </div>
              <p className="mt-1 text-right text-xs text-ink-soft">{t("assistant.sending")}</p>
            </article>
            <div role="status" className="mr-auto w-full max-w-[95%] space-y-2 rounded-lg border border-line p-3">
              <p className="text-sm text-ink-soft">{t("assistant.thinking")}</p>
              <Skeleton variant="text" />
              <Skeleton variant="text" className="w-2/3" />
            </div>
          </>
        )}
      </div>
      {unseen && (
        <Button
          variant="secondary"
          className="absolute bottom-2 left-1/2 -translate-x-1/2 shadow-2"
          onClick={() => {
            stick.current = true;
            setUnseen(false);
            toBottom();
          }}
        >
          <ArrowDown className="h-4 w-4" aria-hidden /> {t("assistant.newBelow")}
        </Button>
      )}
    </div>
  );
}
