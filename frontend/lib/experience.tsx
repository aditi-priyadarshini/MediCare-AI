"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Experience = "standard" | "easy";
const KEY = "medicare.experience";

interface Value {
  experience: Experience;
  setExperience: (e: Experience) => void;
  /** False until the saved choice has been read on this device, so screens can avoid a Standard flash. */
  ready: boolean;
}
const Ctx = createContext<Value>({ experience: "standard", setExperience: () => {}, ready: true });

/** Reads the saved mode. Storage can be blocked (private mode, policy): fall back to Standard, never throw. */
export function readExperience(): Experience {
  try {
    return window.localStorage.getItem(KEY) === "easy" ? "easy" : "standard";
  } catch {
    return "standard";
  }
}

/**
 * Standard / Easy-read. Chosen by the person, never inferred. Stored on this device only (no profile
 * field exists for it; decision #8). Applied as data-experience on <html>; CSS does the rest.
 */
export function ExperienceProvider({ children }: { children: React.ReactNode }) {
  const [experience, set] = useState<Experience>("standard");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    set(readExperience());
    setReady(true);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.experience = experience;
  }, [experience]);

  const setExperience = useCallback((e: Experience) => {
    set(e);
    try {
      window.localStorage.setItem(KEY, e);
    } catch {
      /* not persisted; still applies for this session */
    }
  }, []);

  const value = useMemo(() => ({ experience, setExperience, ready }), [experience, setExperience, ready]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useExperience = () => useContext(Ctx);
