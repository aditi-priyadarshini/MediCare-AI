import type { MessageKey } from "./i18n/en";
import type { Language } from "./types";

/**
 * Voice commands are deliberately tiny: a transcript can only ever be classified as "go to a page",
 * "this would change data (refused)", "emergency (show 112)" or "not understood".
 * This module has no access to the API or to any record, so it cannot alter medicine data.
 * Anything it is unsure about is "unknown": the safe outcome is always to do nothing.
 */
export type NavTarget = { href: string; labelKey: MessageKey };

export type VoiceCommand =
  | { kind: "navigate"; target: NavTarget }
  | { kind: "blocked" }
  | { kind: "emergency" }
  | { kind: "unknown" };

type Words = { en: RegExp; hi: RegExp; or: RegExp };

interface Page extends NavTarget {
  words: Words;
}

const PAGES: Page[] = [
  {
    href: "/dashboard",
    labelKey: "nav.overview",
    words: { en: /\b(overview|home|dashboard)\b/, hi: /(मुख्य पृष्ठ|होम|ओवरव्यू|डैशबोर्ड)/, or: /(ମୂଳ ପୃଷ୍ଠା|ହୋମ|ଓଭରଭ୍ୟୁ|ଡ୍ୟାସବୋର୍ଡ)/ },
  },
  {
    href: "/profile",
    labelKey: "nav.health",
    words: { en: /\b(my health|profile|allerg\w*|conditions)\b/, hi: /(मेरा स्वास्थ्य|प्रोफ़ाइल|प्रोफाइल|एलर्जी)/, or: /(ମୋ ସ୍ୱାସ୍ଥ୍ୟ|ପ୍ରୋଫାଇଲ|ଆଲର୍ଜି)/ },
  },
  {
    href: "/records",
    labelKey: "nav.records",
    words: { en: /\b(records?|documents?)\b/, hi: /(रिकॉर्ड|दस्तावेज़|दस्तावेज)/, or: /(ରେକର୍ଡ|ଦଲିଲ)/ },
  },
  {
    href: "/labs",
    labelKey: "nav.labs",
    words: { en: /\b(labs?|test results?|blood tests?|results)\b/, hi: /(जाँच|जांच|लैब|नतीजे)/, or: /(ପରୀକ୍ଷା|ଲ୍ୟାବ|ଫଳାଫଳ)/ },
  },
  {
    href: "/medications",
    labelKey: "nav.medicines",
    words: { en: /\b(medicines?|medications?|medicine page)\b/, hi: /(दवा|दवाई|दवाइयाँ|दवाएँ|दवाएं)/, or: /(ଔଷଧ)/ },
  },
  {
    href: "/safety",
    labelKey: "nav.safety",
    words: { en: /\b(safety|interactions?)\b/, hi: /(सुरक्षा|इंटरैक्शन)/, or: /(ସୁରକ୍ଷା|ଇଣ୍ଟରାକ୍ସନ)/ },
  },
  {
    href: "/care",
    labelKey: "nav.care",
    words: { en: /\b(find care|pharmac\w*|doctors?|appointments?)\b/, hi: /(फ़ार्मेसी|फार्मेसी|डॉक्टर|अपॉइंटमेंट|देखभाल)/, or: /(ଫାର୍ମାସି|ଡାକ୍ତର|ଆପଏଣ୍ଟମେଣ୍ଟ|ଯତ୍ନ)/ },
  },
  {
    href: "/diet",
    labelKey: "nav.diet",
    words: { en: /\b(diet|meal plans?|meals?|food)\b/, hi: /(आहार|भोजन|खाना)/, or: /(ଖାଦ୍ୟ|ଭୋଜନ)/ },
  },
  {
    href: "/assistant",
    labelKey: "nav.assistant",
    words: { en: /\b(assistant|chat)\b/, hi: /(सहायक|असिस्टेंट|चैट)/, or: /(ସହାୟକ|ଆସିଷ୍ଟାଣ୍ଟ|ଚାଟ୍)/ },
  },
];

/** Phrases that mean "emergency". Checked first; the answer is always "call 112", never an action. */
const EMERGENCY: Words = {
  en: /\b(emergency|ambulance|chest pain|can'?t breathe|cannot breathe|unconscious|heart attack|overdose|poison\w*|suicid\w*)\b/,
  hi: /(आपात|इमरजेंसी|एम्बुलेंस|एंबुलेंस|सीने में दर्द|साँस नहीं|सांस नहीं|बेहोश|दिल का दौरा|ओवरडोज|ज़हर|जहर|आत्महत्या|बचाओ)/,
  or: /(ଜରୁରୀ|ଇମର୍ଜେନ୍ସି|ଆମ୍ବୁଲାନ୍ସ|ଛାତିରେ ଯନ୍ତ୍ରଣା|ନିଶ୍ୱାସ|ଅଚେତ|ହୃଦଘାତ|ଓଭରଡୋଜ|ବିଷ|ଆତ୍ମହତ୍ୟା|ବଞ୍ଚାଅ)/,
};

/** Words that mean "change something" (log a dose, add, delete, stop, ...). Always refused. */
const CHANGE: Words = {
  en: /\b(took|taken|mark(ed)?|log(ged)?|skip(ped)?|delete|remove|add|new|create|stop|start|change|edit|update|refill|reset|undo|order|buy|swallowed|ate)\b|\b(i|we) (had|took)\b|\btake (my|the|a|an|this|that|these)\b/,
  hi: /(लिया|ले ली|खाई|खा ली|खा लिया|मार्क|दर्ज|हटा|मिटा|डिलीट|जोड़|बदल|रोक|बंद|शुरू|स्किप|छोड़|रीसेट|अनडू|ऑर्डर|खरीद|बनाओ|बनाएँ)/,
  or: /(ନେଲି|ଖାଇଲି|ମାର୍କ|ଲେଖ|ଦର୍ଜ|ହଟା|ଡିଲିଟ|ଯୋଡ଼|ଯୋଗ|ବଦଳ|ବନ୍ଦ|ଆରମ୍ଭ|ସ୍କିପ|ଛାଡ଼|ରିସେଟ|ଅର୍ଡର|କିଣ|ତିଆରି)/,
};

export function normaliseTranscript(raw: string): string {
  return raw
    .normalize("NFC")
    .toLowerCase()
    .replace(/['’‘]/g, "") // "can't" -> "cant"
    .replace(/[.,!?।॥"“”]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Checks the spoken language's list and the English one (people mix languages). */
function matches(words: Words, language: Language, text: string): boolean {
  return words[language].test(text) || words.en.test(text);
}

export function parseVoiceCommand(transcript: string, language: Language): VoiceCommand {
  const text = normaliseTranscript(transcript);
  if (!text) return { kind: "unknown" };
  if (matches(EMERGENCY, language, text)) return { kind: "emergency" };
  if (matches(CHANGE, language, text)) return { kind: "blocked" };
  const hits = PAGES.filter((p) => matches(p.words, language, text));
  // Two different pages named in one breath is ambiguous: do nothing rather than guess.
  if (hits.length === 1) return { kind: "navigate", target: { href: hits[0]!.href, labelKey: hits[0]!.labelKey } };
  return { kind: "unknown" };
}
