import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { colors, highContrast } from "./theme";

interface Prefs {
  largeText: boolean;
  highContrast: boolean;
}
interface Ctx extends Prefs {
  c: typeof colors;
  /** Scale a font size by the "large text" preference. */
  fs: (n: number) => number;
  set: (p: Partial<Prefs>) => void;
}
const KEY = "mc.prefs";
const PrefsContext = createContext<Ctx>({
  largeText: false,
  highContrast: false,
  c: colors,
  fs: (n) => n,
  set: () => {},
});

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [p, setP] = useState<Prefs>({ largeText: false, highContrast: false });
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => v && setP(JSON.parse(v) as Prefs))
      .catch(() => {});
  }, []);
  const set = useCallback((next: Partial<Prefs>) => {
    setP((cur) => {
      const merged = { ...cur, ...next };
      AsyncStorage.setItem(KEY, JSON.stringify(merged)).catch(() => {});
      return merged;
    });
  }, []);
  const value = useMemo<Ctx>(
    () => ({
      ...p,
      c: p.highContrast ? highContrast : colors,
      fs: (n) => Math.round(p.largeText ? n * 1.18 : n),
      set,
    }),
    [p, set],
  );
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}
export const useTheme = () => useContext(PrefsContext);
