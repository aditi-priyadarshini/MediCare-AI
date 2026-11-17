"use client";

import { useState } from "react";
import { BodyFields, IdentityFields, PreferenceFields, profileProblems, type Draft } from "@/components/health/ProfileFields";
import { Alert, Button, VerificationBadge } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/lib/api-client";
import { useT } from "@/lib/i18n";
import { toInput, useProfile } from "@/lib/profile-context";

type Keys = ReadonlyArray<keyof Draft>;

/**
 * A profile section that saves on its own. The API takes the whole profile (PUT /profile), so the
 * request is the saved profile with only this section's fields replaced; other sections' unsaved
 * edits are never sent. Only this section's validation problems block the save.
 */
function useSectionSave(keys: Keys) {
  const { profile, save } = useProfile();
  const { show } = useToast();
  const { t } = useT();
  const [draft, setDraft] = useState<Draft>(toInput(profile));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "saving" | "saved" | { error: string }>("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const saved = toInput(profile);
    const merged: Draft = { ...saved };
    for (const k of keys) (merged as Record<string, unknown>)[k] = draft[k];
    const all = profileProblems(merged);
    const mine = Object.fromEntries(Object.entries(all).filter(([k]) => (keys as readonly string[]).includes(k)));
    setErrors(mine);
    if (Object.keys(mine).length) return;
    setState("saving");
    try {
      await save(merged);
      setState("saved");
      show(t("prof.saved"), "success");
    } catch (err) {
      setState({ error: errorMessage(err) });
    }
  }

  return { draft, setDraft, errors, state, submit, t };
}

function SaveRow({ state, t }: { state: ReturnType<typeof useSectionSave>["state"]; t: ReturnType<typeof useT>["t"] }) {
  return (
    <div className="space-y-3">
      {typeof state === "object" && (
        <Alert tone="danger" title={t("prof.saveFailed")}>
          {state.error}
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={state === "saving"}>
          {t("prof.save")}
        </Button>
        <span role="status" className="text-sm text-ink-soft">
          {state === "saved" ? t("prof.saved") : ""}
        </span>
      </div>
    </div>
  );
}

const IDENTITY: Keys = ["display_name", "date_of_birth"];
const BODY: Keys = ["blood_group", "height_cm", "weight_kg"];
const PREFS: Keys = ["preferred_language", "accessibility_preferences"];

export function IdentityForm() {
  const f = useSectionSave(IDENTITY);
  return (
    <form onSubmit={f.submit} noValidate className="space-y-5">
      <IdentityFields draft={f.draft} setDraft={f.setDraft} errors={f.errors} />
      <SaveRow state={f.state} t={f.t} />
    </form>
  );
}

export function BodyForm() {
  const { profile } = useProfile();
  const f = useSectionSave(BODY);
  return (
    <form onSubmit={f.submit} noValidate className="space-y-5">
      <BodyFields draft={f.draft} setDraft={f.setDraft} errors={f.errors} />
      {profile.blood_group && (
        <div className="rounded-lg border border-line bg-canvas p-3 text-sm">
          <p className="flex flex-wrap items-center gap-2 text-ink-soft">
            {f.t("prof.bloodSaved")}: <strong className="text-ink tnum">{profile.blood_group}</strong>
            <VerificationBadge status={profile.blood_group_verification_status} />
          </p>
          <p className="mt-1 text-xs text-ink-soft">{f.t("prof.bloodNote")}</p>
        </div>
      )}
      <SaveRow state={f.state} t={f.t} />
    </form>
  );
}

export function PreferencesForm() {
  const f = useSectionSave(PREFS);
  return (
    <form onSubmit={f.submit} noValidate className="space-y-5">
      <PreferenceFields draft={f.draft} setDraft={f.setDraft} />
      <SaveRow state={f.state} t={f.t} />
    </form>
  );
}
