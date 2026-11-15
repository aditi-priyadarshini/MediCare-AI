"use client";

import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { useT, type MessageKey } from "@/lib/i18n";
import type { RecognitionProblem } from "@/lib/speech";
import { useSpeechRecognition } from "@/lib/use-speech";
import type { Language } from "@/lib/types";

const PROBLEM_KEY: Record<RecognitionProblem, MessageKey> = {
  denied: "voice.denied",
  "no-speech": "voice.noSpeech",
  "language-unsupported": "voice.langUnsupported",
  failed: "voice.failed",
};

/**
 * Dictation into a text box. The transcript is handed to `onText` and nothing else: it is never
 * submitted for the patient. They read it, edit it and press Send themselves.
 */
export function VoiceInputButton({ language, onText }: { language: Language; onText: (text: string) => void }) {
  const { t } = useT();
  const sp = useSpeechRecognition(language);
  if (sp.supported === null) return null;

  const status = sp.listening
    ? sp.interim
      ? t("voice.heard", { text: sp.interim })
      : t("voice.listening")
    : sp.problem
      ? t(PROBLEM_KEY[sp.problem], { language: t(`lang.${language}` as MessageKey) })
      : sp.heard
        ? t("voice.review")
        : "";

  if (!sp.supported) return <p className="text-xs text-ink-soft">{t("voice.unsupported")}</p>;

  return (
    <div className="space-y-1">
      <Button
        variant="secondary"
        aria-pressed={sp.listening}
        onClick={() => (sp.listening ? sp.stop() : sp.start(onText))}
      >
        {sp.listening ? <Square className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
        {sp.listening ? t("voice.stop") : t("voice.start")}
      </Button>
      <p role="status" aria-live="polite" className="min-h-[1.25rem] text-xs text-ink">
        {status}
      </p>
      <p className="text-xs text-ink-soft">{t("voice.privacy")}</p>
    </div>
  );
}
