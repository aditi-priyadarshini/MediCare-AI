"use client";

import { createContext, useContext, useEffect } from "react";
import { api } from "./api-client";
import { useAsync } from "./hooks";
import type { Profile, ProfileInput } from "./types";

interface ProfileValue {
  profile: Profile;
  save: (input: ProfileInput) => Promise<Profile>;
  reload: () => Promise<void>;
}

const ProfileContext = createContext<ProfileValue | null>(null);

/** Applies the patient's accessibility preferences to the document root. */
function useApplyAccessibility(profile: Profile | null) {
  useEffect(() => {
    const root = document.documentElement;
    const p = profile?.accessibility_preferences;
    root.dataset.largeText = String(Boolean(p?.large_text));
    root.dataset.contrast = p?.high_contrast ? "high" : "normal";
    root.dataset.reduceMotion = String(Boolean(p?.reduce_motion));
    // Stays "en": most pages are English, and translated strings are marked with their own lang
    // (see <Tr> in lib/i18n). A Hindi root with English text would be read with the wrong voice.
    root.lang = "en";
  }, [profile]);
}

export function ProfileLoader({
  children,
  fallback,
  errorView,
}: {
  children: React.ReactNode;
  fallback: React.ReactNode;
  errorView: (retry: () => void) => React.ReactNode;
}) {
  const state = useAsync(() => api<Profile>("/profile"), []);
  useApplyAccessibility(state.data);

  if (state.loading && !state.data) return <>{fallback}</>;
  if (!state.data) return <>{errorView(() => void state.reload())}</>;

  const value: ProfileValue = {
    profile: state.data,
    reload: state.reload,
    save: async (input) => {
      const updated = await api<Profile>("/profile", { method: "PUT", body: input });
      await state.reload();
      return updated;
    },
  };
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

/** Like useProfile, but returns null outside a ProfileLoader (shared components and tests). */
export function useOptionalProfile(): ProfileValue | null {
  return useContext(ProfileContext);
}

export function useProfile(): ProfileValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside <ProfileLoader>");
  return ctx;
}

export function toInput(p: Profile): ProfileInput {
  return {
    display_name: p.display_name,
    date_of_birth: p.date_of_birth,
    preferred_language: p.preferred_language,
    timezone: p.timezone,
    height_cm: p.height_cm,
    weight_kg: p.weight_kg,
    blood_group: p.blood_group,
    accessibility_preferences: p.accessibility_preferences,
  };
}
