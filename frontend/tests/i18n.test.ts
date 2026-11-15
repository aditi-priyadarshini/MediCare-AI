import { describe, expect, it } from "vitest";
import { DICTIONARIES, coverage, translate } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("translation files", () => {
  for (const lang of ["hi", "or"] as const) {
    it(`${lang} has no keys that English lacks`, () => {
      const extra = Object.keys(DICTIONARIES[lang]).filter((k) => !(k in en));
      expect(extra).toEqual([]);
    });

    it(`${lang} keeps the same {placeholders} as English`, () => {
      for (const [key, value] of Object.entries(DICTIONARIES[lang])) {
        expect(placeholders(value!), key).toEqual(placeholders(en[key as keyof typeof en]));
      }
    });

    it(`${lang} translates every key that exists today`, () => {
      expect(coverage(lang)).toEqual({ translated: Object.keys(en).length, total: Object.keys(en).length });
    });

    it(`${lang} has no empty strings and none that are just the English text`, () => {
      for (const [key, value] of Object.entries(DICTIONARIES[lang])) {
        expect(value!.trim(), key).not.toBe("");
        if (!/^(lang\.|cmd\.call112)/.test(key)) expect(value, key).not.toBe(en[key as keyof typeof en]);
      }
    });

    it(`${lang} keeps the 112 emergency number in emergency text`, () => {
      expect(DICTIONARIES[lang]["cmd.emergency"]).toContain("112");
      expect(DICTIONARIES[lang]["assistant.emergency"]).toContain("112");
    });
  }
});

describe("translate", () => {
  it("returns the language's text and says which language it is", () => {
    expect(translate("hi", "nav.medicines")).toEqual({ text: "दवाइयाँ", lang: "hi" });
    expect(translate("or", "nav.medicines").lang).toBe("or");
  });

  it("falls back to English, and says so, when a translation is missing", () => {
    const hi = DICTIONARIES.hi;
    const saved = hi["nav.safety"];
    delete hi["nav.safety"];
    try {
      expect(translate("hi", "nav.safety")).toEqual({ text: "Safety", lang: "en" });
    } finally {
      hi["nav.safety"] = saved;
    }
  });

  it("fills {placeholders} and leaves unknown ones visible rather than blank", () => {
    expect(translate("en", "cmd.confirm", { page: "Records" }).text).toBe("Open Records?");
    expect(translate("en", "cmd.confirm").text).toBe("Open {page}?");
    expect(translate("hi", "cmd.confirm", { page: "रिकॉर्ड" }).text).toContain("रिकॉर्ड");
  });

  it("English text never carries a non-English lang", () => {
    expect(translate("en", "nav.records").lang).toBe("en");
  });
});
