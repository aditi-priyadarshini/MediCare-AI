"use client";

import { useState } from "react";
import { toInput, useProfile } from "@/lib/profile-context";
import type { AccessibilityPrefs, Language } from "@/lib/types";

export type PrefKey = keyof AccessibilityPrefs;

/**
 * Saves display, voice and language choices through the one existing path,
 * save({ ...toInput(profile), ... }), and reports a failure instead of swallowing it.
 * Used by the top-bar menu and by /settings so they can never disagree.
 */
export function usePreferences() {
  const { profile, save } = useProfile();
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  async function commit(patch: { preferred_language?: Language; accessibility_preferences?: AccessibilityPrefs }) {
    setFailed(false);
    setSaving(true);
    try {
      await save({ ...toInput(profile), ...patch });
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return {
    language: profile.preferred_language,
    prefs: profile.accessibility_preferences,
    failed,
    saving,
    toggle: (key: PrefKey) => commit({ accessibility_preferences: { ...profile.accessibility_preferences, [key]: !profile.accessibility_preferences[key] } }),
    setLanguage: (language: Language) => commit({ preferred_language: language }),
  };
}
