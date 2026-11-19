"use client";

import { Send } from "lucide-react";
import { useEffect, useRef } from "react";
import { ContextChips } from "@/components/assistant/ContextChips";
import { ImagePicker } from "@/components/ui/ImagePicker";
import { Button } from "@/components/ui/primitives";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";
import { SUGGESTED_PROMPTS, SUGGESTED_PROMPTS_OPEN } from "@/lib/assistant";
import { useT } from "@/lib/i18n";
import type { AssistantContext, Language } from "@/lib/types";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  /** True while anything is in flight (an answer or a switch change). Sending is blocked. */
  busy: boolean;
  /** True only while an answer is being waited for; drives the button spinner. */
  sending: boolean;
  context: AssistantContext;
  language: Language;
  voiceOn: boolean;
  showPrompts: boolean;
  easy: boolean;
  /** Prototype open mode: show the photo buttons and the open-mode prompts. */
  openMode?: boolean;
  /** The picture waiting to be sent with the next message. */
  image?: File | null;
  onImage?: (file: File | null) => void;
}

export function Composer({ value, onChange, onSend, busy, sending, context, language, voiceOn, showPrompts, easy, openMode = false, image = null, onImage }: Props) {
  const { t } = useT();
  const field = useRef<HTMLTextAreaElement>(null);
  const wasBusy = useRef(false);
  const canSend = (value.trim().length > 0 || image !== null) && !busy;

  // After an answer arrives, put the cursor back in the box so the next question can be typed.
  useEffect(() => {
    if (wasBusy.current && !busy) field.current?.focus();
    wasBusy.current = busy;
  }, [busy]);

  const all = openMode ? SUGGESTED_PROMPTS_OPEN : SUGGESTED_PROMPTS;
  const prompts = easy ? all.slice(0, 2) : all;

  return (
    <div className="space-y-3">
      {showPrompts && (
        <div>
          <p className="mb-1 text-sm font-medium text-ink" id="prompt-title">
            {t("assistant.prompts.title")}
          </p>
          <ul aria-labelledby="prompt-title" className="flex flex-wrap gap-2">
            {prompts.map((k) => (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(t(k));
                    field.current?.focus();
                  }}
                  className="min-h-[44px] rounded-full border border-line bg-surface px-3 text-left text-sm text-ink hover:bg-mint-100"
                >
                  {t(k)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!openMode && <ContextChips context={context} />}
      {openMode && onImage && (
        <ImagePicker file={image} onChange={onImage} disabled={busy} hint="Photo of a medicine pack, prescription, rash…" />
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) onSend();
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <label htmlFor="ask" className="sr-only">
          {t("assistant.ask.label")}
        </label>
        <textarea
          id="ask"
          ref={field}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter makes a new line; never send in the middle of IME composition.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          maxLength={2000}
          rows={easy ? 3 : 2}
          placeholder={t("assistant.ask.placeholder")}
          aria-describedby="ask-hint"
          className={`min-h-[44px] flex-1 rounded-lg border border-line p-2 ${easy ? "text-lg" : "text-base"}`}
        />
        <Button type="submit" loading={sending} disabled={!canSend} className="sm:self-end">
          {!sending && <Send className="h-4 w-4" aria-hidden />} {t("assistant.send")}
        </Button>
      </form>
      <p id="ask-hint" className="text-xs text-ink-soft">
        {openMode ? t("assistant.composer.hintOpen") : t("assistant.composer.hint")}
      </p>
      {voiceOn && (
        <VoiceInputButton
          language={language}
          onText={(text) => onChange(`${value ? `${value} ` : ""}${text}`.slice(0, 2000))}
        />
      )}
    </div>
  );
}
