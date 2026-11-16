/**
 * English source strings (the fallback for every language).
 * Placeholders look like {name}. Keep the Hindi and Odia files in the same key set:
 * tests/i18n.test.ts fails if a key is added to only one file or a placeholder differs.
 */
export const en = {
  "lang.en": "English",
  "lang.hi": "Hindi",
  "lang.or": "Odia",

  "nav.overview": "Overview",
  "nav.health": "My Health",
  "nav.records": "Records",
  "nav.labs": "Lab results",
  "nav.medicines": "Medicines",
  "nav.safety": "Safety",
  "nav.care": "Find care",
  "nav.diet": "Diet",
  "nav.share": "Share",
  "nav.emergency": "Emergency",
  "nav.assistant": "Assistant",
  "nav.main": "Main",
  "nav.skip": "Skip to content",
  "nav.signOut": "Sign out",
  "nav.privateNote": "Private by default. Only you can see your records.",

  "locale.notice":
    "This screen was translated by machine and has not been reviewed by a native speaker. Parts that are not translated yet appear in English.",

  "a11y.title": "Accessibility",
  "a11y.largeText": "Larger text",
  "a11y.largeText.desc": "Increases text size across the app.",
  "a11y.contrast": "High contrast",
  "a11y.contrast.desc": "Stronger borders and text colours.",
  "a11y.motion": "Reduce motion",
  "a11y.motion.desc": "Turns off animations.",
  "a11y.voice": "Voice features",
  "a11y.voice.desc":
    "Lets you dictate questions, say simple navigation commands and have text read aloud. Voice never changes your medicine records.",
  "a11y.language": "Preferred language",
  "a11y.language.hint":
    "Your choice is saved. Translations are machine-generated and some pages are still in English.",
  "a11y.quick": "Display settings",
  "a11y.quick.largeText": "Larger text",
  "a11y.quick.contrast": "High contrast",
  "a11y.quick.failed": "That setting could not be saved.",

  "voice.start": "Speak",
  "voice.stop": "Stop",
  "voice.listening": "Listening…",
  "voice.heard": "Heard: “{text}”",
  "voice.review": "Review and edit the text, then press Send. Nothing is sent until you do.",
  "voice.unsupported": "Voice input is not available in this browser. You can type instead.",
  "voice.langUnsupported": "Voice input in {language} is not available in this browser. Type instead, or switch to English.",
  "voice.denied": "Microphone access is blocked. Allow it in your browser settings, or type instead.",
  "voice.noSpeech": "Nothing was heard. Try again.",
  "voice.failed": "Voice input did not work. Try again or type instead.",
  "voice.privacy":
    "Your browser may send your voice to its own speech service to turn it into text. Nothing goes to MediCare AI until you press Send.",

  "tts.read": "Read aloud",
  "tts.stop": "Stop reading",
  "tts.unsupported": "Reading aloud is not available in this browser.",
  "tts.noVoice":
    "No {language} voice is installed on this device, so this text is not being read. Reading it in the wrong language could change its meaning.",
  "tts.failed": "Reading aloud did not work.",

  "cmd.label": "Voice command",
  "cmd.hint": "For example: “open medicines”",
  "cmd.confirm": "Open {page}?",
  "cmd.open": "Open",
  "cmd.cancel": "Cancel",
  "cmd.heard": "Heard: “{text}”",
  "cmd.blocked":
    "Voice cannot log doses or change medicines. Please use the buttons on the Medicines page.",
  "cmd.emergency": "In an emergency call 112 now. This app cannot place the call for you.",
  "cmd.call112": "Call 112",
  "cmd.unknown": "That was not understood. Try saying, for example, “open records”.",

  "doses.readAloud": "Read doses aloud",
  "doses.intro": "Your doses.",
  "doses.line": "{time}, {name}{dose}.",
  "doses.none": "No doses are waiting.",
  "doses.reminder":
    "This is a reminder only. Check the medicine name, strength and time on screen before you take anything.",

  "assistant.ask.label": "Your question",
  "assistant.ask.placeholder": "Ask about your records",
  "assistant.send": "Send",
  "assistant.newChat": "New chat",
  "assistant.notAdvice":
    "Information from your recorded data, not medical advice. It can’t diagnose anything or tell you what to take.",
  "assistant.emergency": "In an emergency call your local emergency number (112 in India).",
} as const satisfies Record<string, string>;

export type MessageKey = keyof typeof en;
export type Dictionary = Partial<Record<MessageKey, string>>;
