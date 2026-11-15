"use client";

import { Square, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/primitives";
import { useT, type MessageKey } from "@/lib/i18n";
import { speak, type SpeakProblem } from "@/lib/speech";
import type { Language } from "@/lib/types";

const PROBLEM_KEY: Record<SpeakProblem | "failed", MessageKey> = {
  unsupported: "tts.unsupported",
  "no-voice": "tts.noVoice",
  failed: "tts.failed",
};

/**
 * Reads `text` aloud in `language`. Reading is a convenience only: whatever is read is also on screen,
 * and this button never performs an action.
 */
export function ReadAloudButton({
  text,
  language,
  label,
  className,
}: {
  text: string;
  language: Language;
  label?: string;
  className?: string;
}) {
  const { t } = useT();
  const [speaking, setSpeaking] = useState(false);
  const [problem, setProblem] = useState<SpeakProblem | "failed" | null>(null);
  const cancel = useRef<(() => void) | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancel.current?.();
    };
  }, []);

  async function toggle() {
    if (speaking) {
      cancel.current?.();
      setSpeaking(false);
      return;
    }
    setProblem(null);
    setSpeaking(true);
    const result = await speak(text, language, {
      onEnd: () => mounted.current && setSpeaking(false),
      onError: () => {
        if (!mounted.current) return;
        setSpeaking(false);
        setProblem("failed");
      },
    });
    if (!result.ok) {
      setSpeaking(false);
      setProblem(result.problem);
      return;
    }
    cancel.current = result.cancel;
  }

  return (
    <div className={className}>
      <Button variant="ghost" aria-pressed={speaking} onClick={() => void toggle()} disabled={!text.trim()}>
        {speaking ? <Square className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
        {speaking ? t("tts.stop") : (label ?? t("tts.read"))}
      </Button>
      <p role="status" aria-live="polite" className="text-xs text-ink-soft">
        {problem ? t(PROBLEM_KEY[problem], { language: t(`lang.${language}` as MessageKey) }) : ""}
      </p>
    </div>
  );
}
