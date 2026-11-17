"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/i18n";
import { labelText, QUICK_ACTIONS, routesFor } from "@/lib/nav";

interface Item {
  id: string;
  href: string;
  text: string;
  kind: "page" | "action";
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  words: string;
}

/**
 * Command palette (Ctrl/Cmd+K). It finds pages and shortcuts to pages. It does NOT search health
 * data (no such endpoint exists) and no action in it changes anything: each one only navigates.
 */
export function SearchCommand() {
  const { t } = useT();
  const router = useRouter();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [mac, setMac] = useState(false);
  const id = useId();

  useEffect(() => setMac(/mac|iphone|ipad/i.test(navigator.platform)), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const items = useMemo<Item[]>(() => {
    const pages = routesFor(user?.role === "admin").map((r) => ({ id: `p-${r.href}`, href: r.href, text: labelText(r.label, t), kind: "page" as const, icon: r.icon, words: r.keywords?.join(" ") ?? "" }));
    const actions = QUICK_ACTIONS.map((a) => ({ id: `a-${a.id}`, href: a.href, text: t(a.label), kind: "action" as const, icon: a.icon, words: a.keywords.join(" ") }));
    return [...actions, ...pages];
  }, [t, user?.role]);

  const q = query.trim().toLowerCase();
  const results = q ? items.filter((i) => `${i.text} ${i.words}`.toLowerCase().includes(q)) : items;

  const close = () => {
    setOpen(false);
    setQuery("");
    setActive(0);
  };
  const go = (item: Item | undefined) => {
    if (!item) return;
    close();
    router.push(item.href);
  };

  function onKeyDown(e: React.KeyboardEvent) {
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[active]);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("shell.search")}
        aria-keyshortcuts="Control+K Meta+K"
        className="inline-flex min-h-control min-w-[44px] items-center justify-center gap-2 rounded-lg border border-line bg-surface px-2 text-sm text-ink-soft hover:bg-mint-100 lg:min-w-[12rem] lg:justify-start lg:px-3"
      >
        <Search className="h-5 w-5 shrink-0" aria-hidden />
        <span className="hidden lg:inline">{t("shell.search")}</span>
        <kbd className="ml-auto hidden rounded border border-line px-1.5 text-xs lg:inline">{mac ? "⌘K" : "Ctrl K"}</kbd>
      </button>

      <Dialog open={open} onClose={close} title={t("shell.search.title")} className="max-w-lg">
        <input
          role="combobox"
          aria-expanded
          aria-autocomplete="list"
          aria-controls={`${id}-list`}
          aria-activedescendant={results.length ? `${id}-o${active}` : undefined}
          aria-label={t("shell.search.title")}
          value={query}
          placeholder={t("shell.search.placeholder")}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="min-h-control w-full rounded-lg border border-line bg-surface px-3 text-base text-ink placeholder:text-ink-soft/70"
        />
        <p className="mt-2 text-xs text-ink-soft">{t("shell.search.hint")}</p>
        <p role="status" className="sr-only">
          {t("shell.search.count", { count: results.length })}
        </p>
        {results.length === 0 ? (
          <p className="py-4 text-sm text-ink-soft">{t("shell.search.empty")}</p>
        ) : (
          <ul id={`${id}-list`} role="listbox" aria-label={t("shell.search.title")} className="mt-2 max-h-72 overflow-y-auto">
            {results.map((r, i) => (
              <li
                key={r.id}
                id={`${id}-o${i}`}
                role="option"
                aria-selected={i === active}
                onMouseMove={() => setActive(i)}
                onClick={() => go(r)}
                className={cn("flex min-h-control cursor-pointer items-center gap-3 rounded-lg px-3 text-sm", i === active ? "bg-mint-100 text-teal-700" : "text-ink")}
              >
                <r.icon className="h-5 w-5 shrink-0" aria-hidden />
                <span className="flex-1">{r.text}</span>
                <span className="text-xs text-ink-soft">{r.kind === "page" ? t("shell.search.page") : t("shell.search.action")}</span>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
    </>
  );
}
