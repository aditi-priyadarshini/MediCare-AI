"use client";

import { Copy, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ImagePicker } from "@/components/ui/ImagePicker";
import { Alert, Button, Card, CheckboxField, Skeleton, TextField } from "@/components/ui/primitives";
import { api, errorMessage } from "@/lib/api-client";
import { useOptionalProfile } from "@/lib/profile-context";
import { AI_MODES, splitAnswer, splitLabel, type AiSafetyAnswer, type AiSafetyMode } from "@/lib/safety-ai";

const MAX_DRUGS = 5;

function Answer({ text }: { text: string }) {
  const { verdict, tone, lines } = splitAnswer(text);
  return (
    <div className="space-y-3">
      {verdict && (
        <Alert tone={tone} title={verdict}>
          <span className="sr-only">Verdict from the AI</span>
        </Alert>
      )}
      <div className="space-y-2 text-ink">
        {lines.map((l, i) => {
          if (!l.trim()) return null;
          const { label, body } = splitLabel(l);
          return (
            <p key={i} className="whitespace-pre-wrap">
              {label && <span className="font-semibold">{label}: </span>}
              {body}
            </p>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One AI safety question. Every answer comes from the AI model; it can be asked again as often as
 * you like ("Try again"). The page sends only what you typed, plus (if you allow it) your current
 * medicines, conditions and allergies, never your name.
 */
export function AiSafetyPanel({ mode, autoRun = false, heading = true }: { mode: AiSafetyMode; autoRun?: boolean; heading?: boolean }) {
  const meta = AI_MODES.find((m) => m.mode === mode)!;
  const language = useOptionalProfile()?.profile?.preferred_language ?? "en";

  const [drugs, setDrugs] = useState<string[]>(mode === "drug_drug" ? ["", ""] : [""]);
  const [foods, setFoods] = useState("");
  const [question, setQuestion] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [useRecords, setUseRecords] = useState(mode !== "drug_drug");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiSafetyAnswer | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const seq = useRef(0);

  const typed = drugs.map((d) => d.trim()).filter(Boolean);
  const ready =
    mode === "drug_drug" ? typed.length >= 2
    : mode === "medicine" ? typed.length >= 1
    : mode === "food" ? foods.trim().length > 0 || typed.length > 0
    : mode === "general" ? question.trim().length > 0 || image !== null
    : true;

  async function run() {
    const n = ++seq.current;
    setBusy(true);
    setFailure(null);
    setCopied(false);
    const form = new FormData();
    form.append("mode", mode);
    form.append("drugs", JSON.stringify(typed));
    form.append("foods", JSON.stringify(foods.split(",").map((f) => f.trim()).filter(Boolean)));
    form.append("question", question.trim());
    form.append("use_records", String(useRecords || mode === "my_medicines"));
    form.append("language", language);
    if (image) form.append("image", image);
    try {
      const out = await api<AiSafetyAnswer>("/safety/ai/ask", { method: "POST", body: form });
      if (n === seq.current) setResult(out);
    } catch (e) {
      if (n === seq.current) setFailure(errorMessage(e));
    } finally {
      if (n === seq.current) setBusy(false);
    }
  }

  // "My medicines" shows its answer as soon as the page opens.
  useEffect(() => {
    if (autoRun) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.answer);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const setDrug = (i: number, v: string) => setDrugs((d) => d.map((x, j) => (j === i ? v : x)));

  return (
    <Card className="space-y-4">
      {heading && (
        <div>
          <h2 className="flex items-center gap-2 text-h3 text-ink">
            <Sparkles className="h-5 w-5 text-lavender-700" aria-hidden /> {meta.title}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">{meta.text}</p>
        </div>
      )}

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && !busy) void run();
        }}
      >
        {(mode === "drug_drug" || mode === "medicine") && (
          <div className="space-y-2">
            {drugs.map((d, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <TextField
                    label={mode === "medicine" ? "Medicine" : `Medicine ${i + 1}`}
                    value={d}
                    onChange={(e) => setDrug(i, e.target.value)}
                    maxLength={60}
                    placeholder={i === 0 ? "for example: warfarin" : "for example: aspirin"}
                    autoComplete="off"
                  />
                </div>
                {mode === "drug_drug" && drugs.length > 2 && (
                  <Button variant="ghost" aria-label={`Remove medicine ${i + 1}`} onClick={() => setDrugs((x) => x.filter((_, j) => j !== i))}>
                    <X className="h-4 w-4" aria-hidden />
                  </Button>
                )}
              </div>
            ))}
            {mode === "drug_drug" && drugs.length < MAX_DRUGS && (
              <Button variant="ghost" onClick={() => setDrugs((x) => [...x, ""])}>
                <Plus className="h-4 w-4" aria-hidden /> Add another medicine
              </Button>
            )}
          </div>
        )}

        {mode === "food" && (
          <TextField
            label="Foods, drinks or alcohol"
            hint="Separate with commas, for example: grapefruit juice, alcohol, milk"
            value={foods}
            onChange={(e) => setFoods(e.target.value)}
            maxLength={400}
          />
        )}

        {mode === "general" && (
          <>
            <div className="space-y-1.5">
              <label htmlFor={`q-${mode}`} className="block text-sm font-medium text-ink">
                Your question <span className="font-normal text-ink-soft">(optional if you add a photo)</span>
              </label>
              <textarea
                id={`q-${mode}`}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={1500}
                rows={3}
                placeholder="For example: can I take this tablet with my other medicines?"
                className="w-full rounded-lg border border-line bg-surface p-3 text-base text-ink"
              />
            </div>
            <ImagePicker file={image} onChange={setImage} disabled={busy} hint="Photo of a medicine pack, strip or prescription" />
          </>
        )}

        {mode !== "my_medicines" && (
          <CheckboxField
            label="Also use my medicines, conditions and allergies"
            description="Sent to the AI without your name. Needs “AI uses my records” turned on in My Health."
            checked={useRecords}
            onChange={(e) => setUseRecords(e.target.checked)}
          />
        )}
        {mode === "my_medicines" && (
          <TextField
            label="Foods or drinks to include"
            hint="Optional. Separate with commas, for example: grapefruit, alcohol."
            value={foods}
            onChange={(e) => setFoods(e.target.value)}
            maxLength={400}
            optional
          />
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={busy} disabled={!ready}>
            {result ? "Check again" : mode === "my_medicines" ? "Review my medicines" : "Ask the AI"}
          </Button>
        </div>
      </form>

      {failure && (
        <Alert tone="danger" title="The AI did not answer">
          <p>{failure}</p>
          <Button variant="secondary" className="mt-2" onClick={() => void run()} disabled={busy}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Try again
          </Button>
        </Alert>
      )}

      {busy && !result && (
        <div aria-busy="true" role="status" className="space-y-2">
          <p className="text-sm text-ink-soft">The AI is working on it…</p>
          <Skeleton variant="text" />
          <Skeleton variant="text" className="w-2/3" />
        </div>
      )}

      {result && (
        <div className={busy ? "space-y-3 opacity-60" : "space-y-3"} aria-live="polite">
          <Answer text={result.answer} />
          {result.note && <Alert tone="info">{result.note}</Alert>}
          <p className="text-xs text-ink-soft">
            {result.records_used ? "Used your medicines, conditions and allergies. " : "Your records were not used. "}
            {result.image_used ? "Your photo was sent to the AI. " : ""}
            {result.disclaimer}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void run()} loading={busy}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Try again
            </Button>
            <Button variant="ghost" onClick={() => void copy()}>
              <Copy className="h-4 w-4" aria-hidden /> {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
