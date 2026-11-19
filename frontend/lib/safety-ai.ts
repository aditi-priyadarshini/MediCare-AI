/** The AI Safety Checker: one endpoint, five kinds of question. */

export type AiSafetyMode = "drug_drug" | "my_medicines" | "medicine" | "food" | "general";

export interface AiSafetyAnswer {
  mode: AiSafetyMode;
  answer: string;
  records_used: boolean;
  image_used: boolean;
  note: string | null;
  disclaimer: string;
  provider: string | null;
  model: string | null;
}

export const AI_MODES: Array<{ mode: AiSafetyMode; tab: string; title: string; text: string }> = [
  { mode: "drug_drug", tab: "Two medicines", title: "Medicine and medicine", text: "Type any two medicines and the AI explains how they interact." },
  { mode: "my_medicines", tab: "My medicines", title: "Review everything I take", text: "The AI reviews your whole medicine list together with your conditions, allergies and age." },
  { mode: "medicine", tab: "One medicine", title: "Check one medicine against me", text: "Type a medicine you are thinking of taking. The AI checks it against your list, conditions and allergies." },
  { mode: "food", tab: "Food and drink", title: "Food, drink and alcohol", text: "Check what you eat or drink against your medicines." },
  { mode: "general", tab: "Ask or photo", title: "Ask anything or send a photo", text: "Ask any medicine question, or photograph a pack, strip or prescription." },
];

/** Splits "Verdict: Serious. ..." from the rest, and finds the tone for the verdict. */
export function splitAnswer(text: string): { verdict: string | null; tone: "danger" | "warning" | "info"; lines: string[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd());
  const first = lines.findIndex((l) => /^verdict\s*:/i.test(l.trim()));
  let verdict: string | null = null;
  if (first >= 0) {
    verdict = lines[first]!.replace(/^\s*verdict\s*:\s*/i, "").trim();
    lines.splice(first, 1);
  }
  const v = (verdict ?? "").toLowerCase();
  const tone = /^(serious|major|severe|dangerous|contraindicated)/.test(v) ? "danger" : /^(moderate|caution)/.test(v) ? "warning" : "info";
  return { verdict, tone, lines: lines.filter((l, i, a) => l.trim() !== "" || (i > 0 && a[i - 1]!.trim() !== "")) };
}

/** "What it means: text" -> label and body, for lines that start with a short label. */
export function splitLabel(line: string): { label: string | null; body: string } {
  const m = /^([A-Z][A-Za-z' ]{2,28}):\s*(.*)$/.exec(line.trim());
  return m ? { label: m[1]!, body: m[2]! } : { label: null, body: line };
}
