"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import type { Language } from "../types";
import { en, type Dictionary, type MessageKey } from "./en";
import { hi } from "./hi";
import { or } from "./or";

export type { MessageKey } from "./en";

export const DICTIONARIES: Record<Language, Dictionary> = { en, hi, or };

export type Vars = Record<string, string | number>;

export interface Translation {
  text: string;
  /** Language the returned text is actually in (English when a translation is missing). */
  lang: Language;
}

function fill(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

/** Looks a key up in `language`, falling back to English. Never throws, never returns a key name. */
export function translate(language: Language, key: MessageKey, vars?: Vars): Translation {
  const own = language === "en" ? undefined : DICTIONARIES[language][key];
  if (own) return { text: fill(own, vars), lang: language };
  return { text: fill(en[key], vars), lang: "en" };
}

/** How many English keys have a translation in `language`. */
export function coverage(language: Language): { translated: number; total: number } {
  const keys = Object.keys(en) as MessageKey[];
  if (language === "en") return { translated: keys.length, total: keys.length };
  const d = DICTIONARIES[language];
  return { translated: keys.filter((k) => Boolean(d[k])).length, total: keys.length };
}

interface I18nValue {
  language: Language;
  /** Plain string, for attributes such as aria-label and placeholder. */
  t: (key: MessageKey, vars?: Vars) => string;
  /** Like t, but also says which language the text is in so it can be marked up with lang. */
  tx: (key: MessageKey, vars?: Vars) => Translation;
}

const make = (language: Language): I18nValue => ({
  language,
  t: (key, vars) => translate(language, key, vars).text,
  tx: (key, vars) => translate(language, key, vars),
});

const I18nContext = createContext<I18nValue>(make("en"));

/**
 * Provides the UI language. The document root stays lang="en" because most pages are still English;
 * translated strings are marked up individually (see <Tr>) so screen readers pick the right voice.
 */
export function I18nProvider({ language, children }: { language: Language; children: React.ReactNode }) {
  const value = useMemo(() => make(language), [language]);
  useEffect(() => {
    document.documentElement.dataset.uiLang = language;
    return () => {
      delete document.documentElement.dataset.uiLang;
    };
  }, [language]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): I18nValue {
  return useContext(I18nContext);
}

/** Visible translated text, wrapped with the language it is really in. */
export function Tr({ k, vars }: { k: MessageKey; vars?: Vars }) {
  const { tx } = useT();
  const { text, lang } = tx(k, vars);
  return <span lang={lang}>{text}</span>;
}
