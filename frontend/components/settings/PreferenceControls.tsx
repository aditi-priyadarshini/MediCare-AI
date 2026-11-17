"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";
import { useExperience, type Experience } from "@/lib/experience";
import { useT, type MessageKey } from "@/lib/i18n";
import { usePreferences, type PrefKey } from "@/lib/preferences";

/** One on/off preference. Text says On/Off as well as showing the knob, so it is never colour-only. */
function Switch({ label, description, checked, disabled, onChange }: { label: string; description?: string; checked: boolean; disabled?: boolean; onChange: () => void }) {
  const { t } = useT();
  const id = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={`${id}-l`}
      aria-describedby={description ? `${id}-d` : undefined}
      disabled={disabled}
      onClick={onChange}
      className="flex min-h-control w-full items-start justify-between gap-3 rounded-lg px-1 py-2 text-left hover:bg-mint-100 disabled:opacity-60"
    >
      <span className="min-w-0">
        <span id={`${id}-l`} className="block text-sm font-medium text-ink">
          {label}
        </span>
        {description && (
          <span id={`${id}-d`} className="mt-0.5 block text-sm text-ink-soft">
            {description}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-2 pt-0.5 text-sm font-medium text-ink">
        <span aria-hidden className={cn("flex h-6 w-11 items-center rounded-full border border-line p-0.5 transition-colors duration-fast", checked ? "bg-teal-700" : "bg-surface")}>
          <span className={cn("h-4 w-4 rounded-full transition-transform duration-fast ease-out", checked ? "translate-x-5 bg-white" : "translate-x-0 bg-ink-soft")} />
        </span>
        <span className="w-7">{checked ? t("pref.on") : t("pref.off")}</span>
      </span>
    </button>
  );
}

const SWITCHES: Array<{ key: PrefKey; label: MessageKey; desc: MessageKey }> = [
  { key: "large_text", label: "a11y.largeText", desc: "a11y.largeText.desc" },
  { key: "high_contrast", label: "a11y.contrast", desc: "a11y.contrast.desc" },
  { key: "reduce_motion", label: "a11y.motion", desc: "a11y.motion.desc" },
  { key: "voice_enabled", label: "a11y.voice", desc: "a11y.voice.desc" },
];

/** The four saved accessibility preferences. `only` picks a subset; `compact` drops the long descriptions. */
export function PreferenceSwitches({ only, compact }: { only?: PrefKey[]; compact?: boolean }) {
  const { t } = useT();
  const { prefs, toggle, failed, saving } = usePreferences();
  return (
    <div>
      {SWITCHES.filter((s) => !only || only.includes(s.key)).map((s) => (
        <Switch key={s.key} label={t(s.label)} description={compact ? undefined : t(s.desc)} checked={prefs[s.key]} disabled={saving} onChange={() => void toggle(s.key)} />
      ))}
      {failed && (
        <p role="alert" className="mt-2 text-sm font-medium text-danger-700">
          {t("a11y.quick.failed")}
        </p>
      )}
    </div>
  );
}

/** Standard / Easy-read. Chosen by the person; stored on this device only. */
export function ExperienceChoice({ legend }: { legend?: string }) {
  const { t } = useT();
  const { experience, setExperience } = useExperience();
  const name = useId();
  const options: Array<{ value: Experience; label: MessageKey; desc: MessageKey }> = [
    { value: "standard", label: "exp.standard", desc: "exp.standard.desc" },
    { value: "easy", label: "exp.easy", desc: "exp.easy.desc" },
  ];
  return (
    <fieldset>
      <legend className="text-sm font-medium text-ink">{legend ?? t("exp.mode")}</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "flex min-h-control cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm",
              experience === o.value ? "border-teal-700 bg-mint-100" : "border-line bg-surface hover:bg-mint-100",
            )}
          >
            <input type="radio" name={name} value={o.value} checked={experience === o.value} onChange={() => setExperience(o.value)} className="mt-1 h-4 w-4 accent-teal-700" />
            <span>
              <span className="block font-medium text-ink">{t(o.label)}</span>
              <span className="block text-ink-soft">{t(o.desc)}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-soft">{t("exp.deviceNote")}</p>
    </fieldset>
  );
}
