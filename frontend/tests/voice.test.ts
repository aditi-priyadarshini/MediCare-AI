import { describe, expect, it } from "vitest";
import {
  chunkText,
  mapRecognitionError,
  pickVoice,
  scriptLanguage,
  speakableAnswer,
} from "@/lib/speech";
import { normaliseTranscript, parseVoiceCommand } from "@/lib/voice-commands";

describe("voice commands", () => {
  it("opens exactly the page that was named", () => {
    expect(parseVoiceCommand("open medicines", "en")).toMatchObject({ kind: "navigate", target: { href: "/medications" } });
    expect(parseVoiceCommand("Go to my lab results.", "en")).toMatchObject({ kind: "navigate", target: { href: "/labs" } });
    expect(parseVoiceCommand("take me to the assistant", "en")).toMatchObject({ kind: "navigate", target: { href: "/assistant" } });
    expect(parseVoiceCommand("show records", "en")).toMatchObject({ kind: "navigate", target: { href: "/records" } });
  });

  it("understands Hindi and Odia page names", () => {
    expect(parseVoiceCommand("दवाइयाँ खोलो", "hi")).toMatchObject({ kind: "navigate", target: { href: "/medications" } });
    expect(parseVoiceCommand("रिकॉर्ड दिखाओ", "hi")).toMatchObject({ kind: "navigate", target: { href: "/records" } });
    expect(parseVoiceCommand("ଔଷଧ ଖୋଲ", "or")).toMatchObject({ kind: "navigate", target: { href: "/medications" } });
    expect(parseVoiceCommand("ସହାୟକ ଖୋଲ", "or")).toMatchObject({ kind: "navigate", target: { href: "/assistant" } });
  });

  it("refuses anything that would log a dose or change a medicine", () => {
    for (const phrase of [
      "I took my medicine",
      "mark metformin as taken",
      "log a dose",
      "skip my morning tablet",
      "delete my medicines",
      "add a new medicine",
      "stop my medication",
      "take my medicine",
      "open medicines and mark it taken",
    ]) {
      expect(parseVoiceCommand(phrase, "en"), phrase).toEqual({ kind: "blocked" });
    }
    expect(parseVoiceCommand("मैंने दवा ले ली", "hi")).toEqual({ kind: "blocked" });
    expect(parseVoiceCommand("दवा हटाओ", "hi")).toEqual({ kind: "blocked" });
    expect(parseVoiceCommand("ମୁଁ ଔଷଧ ନେଲି", "or")).toEqual({ kind: "blocked" });
  });

  it("answers emergencies with the emergency result, ahead of everything else", () => {
    expect(parseVoiceCommand("I have chest pain", "en")).toEqual({ kind: "emergency" });
    expect(parseVoiceCommand("call an ambulance", "en")).toEqual({ kind: "emergency" });
    expect(parseVoiceCommand("I can't breathe, open medicines", "en")).toEqual({ kind: "emergency" });
    expect(parseVoiceCommand("एम्बुलेंस बुलाओ", "hi")).toEqual({ kind: "emergency" });
    expect(parseVoiceCommand("ଆମ୍ବୁଲାନ୍ସ", "or")).toEqual({ kind: "emergency" });
  });

  it("does nothing when unsure: no page, two pages, or noise", () => {
    expect(parseVoiceCommand("", "en")).toEqual({ kind: "unknown" });
    expect(parseVoiceCommand("what is the weather", "en")).toEqual({ kind: "unknown" });
    expect(parseVoiceCommand("open records and labs", "en")).toEqual({ kind: "unknown" });
  });

  it("can only ever produce one of four harmless outcomes", () => {
    const kinds = new Set(
      ["open safety", "log dose", "help ambulance", "mumble", "show profile", "remove it"].map(
        (p) => parseVoiceCommand(p, "en").kind,
      ),
    );
    for (const k of kinds) expect(["navigate", "blocked", "emergency", "unknown"]).toContain(k);
  });

  it("normalises punctuation, case and apostrophes", () => {
    expect(normaliseTranscript("  Can’t  BREATHE!! ")).toBe("cant breathe");
  });
});

describe("speech helpers", () => {
  it("maps recognition errors, ignoring our own aborts", () => {
    expect(mapRecognitionError("not-allowed")).toBe("denied");
    expect(mapRecognitionError("language-not-supported")).toBe("language-unsupported");
    expect(mapRecognitionError("no-speech")).toBe("no-speech");
    expect(mapRecognitionError("aborted")).toBeNull();
    expect(mapRecognitionError("network")).toBe("failed");
  });

  it("strips citation markers before reading aloud", () => {
    expect(speakableAnswer("HbA1c was 8.2 [E1] then 7.4 [E2].")).toBe("HbA1c was 8.2 then 7.4.");
  });

  it("chunks on sentence ends without splitting numbers or words", () => {
    const text = "HbA1c fell from 8.2% to 7.4% between the two tests. The unit is the same. Next check is due.";
    const chunks = chunkText(text, 60);
    expect(chunks.join(" ")).toBe(text);
    expect(chunks.every((c) => c.length <= 60)).toBe(true);
    expect(chunks.some((c) => c.endsWith("8.") || c.endsWith("7."))).toBe(false);
  });

  it("splits a very long sentence on spaces only", () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
    const chunks = chunkText(long, 50);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(" ")).toBe(long);
  });

  it("chunks Hindi on the danda", () => {
    expect(chunkText("पहला वाक्य। दूसरा वाक्य।", 14)).toEqual(["पहला वाक्य।", "दूसरा वाक्य।"]);
  });

  it("judges the language of text by script", () => {
    expect(scriptLanguage("Your HbA1c is 7.4")).toBe("en");
    expect(scriptLanguage("आपका HbA1c 7.4 है")).toBe("hi");
    expect(scriptLanguage("ଆପଣଙ୍କ ପରୀକ୍ଷା ଫଳାଫଳ")).toBe("or");
    expect(scriptLanguage("12 / 34", "hi")).toBe("hi");
  });

  it("only picks a voice for the same language", () => {
    const voices = [{ lang: "en-GB" }, { lang: "hi_IN" }, { lang: "en-IN" }];
    expect(pickVoice(voices, "en")).toEqual({ lang: "en-IN" });
    expect(pickVoice(voices, "hi")).toEqual({ lang: "hi_IN" });
    expect(pickVoice(voices, "or")).toBeNull();
    expect(pickVoice([], "en")).toBeNull();
  });
});
