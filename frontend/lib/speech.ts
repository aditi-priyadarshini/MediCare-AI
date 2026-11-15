/**
 * Speech adapters. Everything browser-specific lives here so components never touch
 * window.SpeechRecognition / speechSynthesis directly, and a server-side provider could be swapped in
 * behind the same functions later.
 *
 * Privacy: browser speech recognition is usually performed by the browser vendor's cloud service.
 * Nothing is sent to MediCare AI by this module; transcripts only reach the app as text the patient
 * can read and edit.
 */
import type { Language } from "./types";

export const SPEECH_LOCALE: Record<Language, string> = { en: "en-IN", hi: "hi-IN", or: "or-IN" };

export type RecognitionProblem = "denied" | "no-speech" | "language-unsupported" | "failed";
export type SpeakProblem = "unsupported" | "no-voice";

/* ------------------------------------------------------------- recognition */

interface AlternativeLike {
  transcript: string;
}
interface ResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: AlternativeLike;
}
interface RecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: ResultLike };
}
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => RecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const recognitionSupported = (): boolean => recognitionCtor() !== null;

export function mapRecognitionError(code: string): RecognitionProblem | null {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "denied";
    case "no-speech":
      return "no-speech";
    case "language-not-supported":
      return "language-unsupported";
    case "aborted":
      return null; // we stopped it ourselves
    default:
      return "failed";
  }
}

export interface RecognizerHandlers {
  onInterim: (text: string) => void;
  /** Called once with the final transcript. The caller decides what (if anything) to do with it. */
  onFinal: (text: string) => void;
  onProblem: (problem: RecognitionProblem) => void;
  onEnd: () => void;
}

export interface Recognizer {
  start: () => void;
  stop: () => void;
  abort: () => void;
}

/** One-utterance recogniser, or null when the browser has none. */
export function createRecognizer(language: Language, h: RecognizerHandlers): Recognizer | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;
  const r = new Ctor();
  r.lang = SPEECH_LOCALE[language];
  r.continuous = false;
  r.interimResults = true;
  r.maxAlternatives = 1;
  r.onresult = (e) => {
    let interim = "";
    let final = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i]!;
      const text = res[0]?.transcript ?? "";
      if (res.isFinal) final += text;
      else interim += text;
    }
    if (final.trim()) h.onFinal(final.trim());
    else if (interim.trim()) h.onInterim(interim.trim());
  };
  r.onerror = (e) => {
    const p = mapRecognitionError(e.error);
    if (p) h.onProblem(p);
  };
  r.onend = () => h.onEnd();
  return { start: () => r.start(), stop: () => r.stop(), abort: () => r.abort() };
}

/* --------------------------------------------------------------- synthesis */

export const synthesisSupported = (): boolean =>
  typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

/** Removes [E#] citation markers and collapses whitespace so the text reads naturally. */
export function speakableAnswer(content: string): string {
  return content.replace(/\s*\[E\d+\]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Splits text into chunks of at most `max` characters on sentence ends, then on spaces.
 * Never splits inside a word or number ("7.4" stays whole). Long utterances are unreliable in
 * several browsers, so speech is queued chunk by chunk.
 */
export function chunkText(text: string, max = 200): string[] {
  const sentences = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?।॥])\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  const push = () => {
    if (current) chunks.push(current);
    current = "";
  };
  for (const sentence of sentences) {
    if (sentence.length > max) {
      push();
      for (const word of sentence.split(" ")) {
        if (current && current.length + 1 + word.length > max) push();
        current = current ? `${current} ${word}` : word;
      }
      push();
      continue;
    }
    if (current && current.length + 1 + sentence.length > max) push();
    current = current ? `${current} ${sentence}` : sentence;
  }
  push();
  return chunks;
}

/** Which language a piece of text is written in, judged by script. Falls back when it has no letters. */
export function scriptLanguage(text: string, fallback: Language = "en"): Language {
  let latin = 0;
  let devanagari = 0;
  let odia = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x0900 && c <= 0x097f) devanagari++;
    else if (c >= 0x0b00 && c <= 0x0b7f) odia++;
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) latin++;
  }
  if (latin + devanagari + odia === 0) return fallback;
  if (devanagari > latin && devanagari >= odia) return "hi";
  if (odia > latin && odia > devanagari) return "or";
  return "en";
}

const norm = (tag: string) => tag.replace("_", "-").toLowerCase();

/** Prefers an exact locale match (hi-IN), then any voice for the language (hi-*). Never a different language. */
export function pickVoice<V extends { lang: string }>(voices: V[], language: Language): V | null {
  const locale = norm(SPEECH_LOCALE[language]);
  const base = language;
  return (
    voices.find((v) => norm(v.lang) === locale) ??
    voices.find((v) => norm(v.lang) === base || norm(v.lang).startsWith(`${base}-`)) ??
    null
  );
}

export async function loadVoices(timeoutMs = 1000): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis;
  const now = synth.getVoices();
  if (now.length > 0) return now;
  await new Promise<void>((resolve) => {
    const done = () => {
      synth.removeEventListener?.("voiceschanged", done);
      resolve();
    };
    synth.addEventListener?.("voiceschanged", done);
    setTimeout(done, timeoutMs);
  });
  return synth.getVoices();
}

export type SpeakResult = { ok: true; cancel: () => void } | { ok: false; problem: SpeakProblem };

/**
 * Reads text aloud in `language`. Refuses (no-voice) rather than reading Hindi or Odia text with a voice
 * for another language, because mispronounced medical text can mislead.
 */
export async function speak(
  text: string,
  language: Language,
  hooks: { onEnd: () => void; onError: () => void },
): Promise<SpeakResult> {
  if (!synthesisSupported()) return { ok: false, problem: "unsupported" };
  const voices = await loadVoices();
  const voice = pickVoice(voices, language);
  if (!voice && language !== "en") return { ok: false, problem: "no-voice" };

  const synth = window.speechSynthesis;
  const chunks = chunkText(text);
  let stopped = false;
  synth.cancel();
  chunks.forEach((chunk, i) => {
    const u = new SpeechSynthesisUtterance(chunk);
    u.lang = voice?.lang ?? SPEECH_LOCALE[language];
    if (voice) u.voice = voice;
    u.rate = 0.9;
    if (i === chunks.length - 1) u.onend = () => hooks.onEnd();
    u.onerror = (e) => {
      if (stopped || e.error === "canceled" || e.error === "interrupted") hooks.onEnd();
      else hooks.onError();
    };
    synth.speak(u);
  });
  return {
    ok: true,
    cancel: () => {
      stopped = true;
      synth.cancel();
    },
  };
}
