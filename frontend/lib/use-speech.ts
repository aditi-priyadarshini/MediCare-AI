"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createRecognizer,
  recognitionSupported,
  type RecognitionProblem,
  type Recognizer,
} from "./speech";
import type { Language } from "./types";

/**
 * One-shot dictation. `supported` is null until the browser has been checked (avoids a server/client
 * markup mismatch). The caller receives the final transcript and decides what to do with it.
 */
export function useSpeechRecognition(language: Language) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [heard, setHeard] = useState("");
  const [problem, setProblem] = useState<RecognitionProblem | null>(null);
  const ref = useRef<Recognizer | null>(null);

  useEffect(() => {
    setSupported(recognitionSupported());
    return () => ref.current?.abort();
  }, []);

  const start = useCallback(
    (onFinal: (text: string) => void) => {
      ref.current?.abort();
      setProblem(null);
      setInterim("");
      setHeard("");
      const r = createRecognizer(language, {
        onInterim: setInterim,
        onFinal: (text) => {
          setHeard(text);
          setInterim("");
          onFinal(text);
        },
        onProblem: setProblem,
        onEnd: () => {
          setListening(false);
          setInterim("");
        },
      });
      if (!r) {
        setSupported(false);
        return;
      }
      ref.current = r;
      try {
        r.start();
        setListening(true);
      } catch {
        setProblem("failed");
      }
    },
    [language],
  );

  const stop = useCallback(() => ref.current?.stop(), []);
  const clear = useCallback(() => {
    setHeard("");
    setProblem(null);
  }, []);

  return { supported, listening, interim, heard, problem, start, stop, clear };
}
