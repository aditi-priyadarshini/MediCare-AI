"use client";

import { Mic, Phone, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/primitives";
import { useT, type MessageKey } from "@/lib/i18n";
import { useOptionalProfile } from "@/lib/profile-context";
import { useSpeechRecognition } from "@/lib/use-speech";
import { parseVoiceCommand, type VoiceCommand } from "@/lib/voice-commands";

/**
 * Header control for spoken navigation. A spoken command can only offer to open a page, and the page
 * opens only after the patient taps "Open". It cannot log doses, change medicines or place a call.
 */
export function VoiceCommandBar() {
  const { t, language } = useT();
  const router = useRouter();
  const enabled = useOptionalProfile()?.profile.accessibility_preferences.voice_enabled ?? false;
  const sp = useSpeechRecognition(language);
  const [command, setCommand] = useState<(VoiceCommand & { heard: string }) | null>(null);

  useEffect(() => {
    if (!command) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCommand(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [command]);

  if (!enabled || !sp.supported) return null;

  const listen = () => {
    setCommand(null);
    sp.start((text) => setCommand({ ...parseVoiceCommand(text, language), heard: text }));
  };

  const problemKey: Record<string, MessageKey> = {
    denied: "voice.denied",
    "no-speech": "voice.noSpeech",
    "language-unsupported": "voice.langUnsupported",
    failed: "voice.failed",
  };

  const panel = sp.listening
    ? t("voice.listening")
    : sp.problem
      ? t(problemKey[sp.problem]!, { language: t(`lang.${language}` as MessageKey) })
      : null;

  return (
    <>
      <Button
        variant="secondary"
        aria-pressed={sp.listening}
        aria-label={t("cmd.label")}
        title={t("cmd.hint")}
        onClick={() => (sp.listening ? sp.stop() : listen())}
      >
        {sp.listening ? <Square className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
        <span className="hidden md:inline">{t("cmd.label")}</span>
      </Button>

      {(panel || command) && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 top-[4.5rem] z-30 w-[min(22rem,calc(100vw-2rem))] space-y-2 rounded-lg border border-line bg-surface p-3 text-sm shadow-lg"
        >
          {panel && <p>{panel}</p>}
          {command && (
            <>
              <p className="text-xs text-ink-soft">{t("cmd.heard", { text: command.heard })}</p>
              {command.kind === "navigate" && (
                <>
                  <p className="font-medium text-ink">{t("cmd.confirm", { page: t(command.target.labelKey) })}</p>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        const href = command.target.href;
                        setCommand(null);
                        router.push(href);
                      }}
                    >
                      {t("cmd.open")}
                    </Button>
                    <Button variant="secondary" onClick={() => setCommand(null)}>
                      {t("cmd.cancel")}
                    </Button>
                  </div>
                </>
              )}
              {command.kind === "blocked" && <p className="text-ink">{t("cmd.blocked")}</p>}
              {command.kind === "unknown" && <p className="text-ink">{t("cmd.unknown")}</p>}
              {command.kind === "emergency" && (
                <>
                  <p className="font-semibold text-danger-700">{t("cmd.emergency")}</p>
                  <a
                    href="tel:112"
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-danger-700 px-4 font-semibold text-white"
                  >
                    <Phone className="h-4 w-4" aria-hidden /> {t("cmd.call112")}
                  </a>
                </>
              )}
              {command.kind !== "navigate" && (
                <Button variant="ghost" onClick={() => setCommand(null)}>
                  {t("cmd.cancel")}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
