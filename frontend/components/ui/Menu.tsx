"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

/** Button + menu. Arrow keys move, Home/End jump, Escape closes and returns focus to the button. */
export function Menu({ label, items, className }: { label: React.ReactNode; items: MenuItem[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const options = () => Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? []);

  useEffect(() => {
    if (open) options()[0]?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!list.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const onKey = (e: React.KeyboardEvent) => {
    const o = options();
    const i = o.indexOf(document.activeElement as HTMLButtonElement);
    const go = (target?: HTMLElement) => {
      e.preventDefault();
      target?.focus();
    };
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") go(o[(i + 1) % o.length]);
    else if (e.key === "ArrowUp") go(o[(i - 1 + o.length) % o.length]);
    else if (e.key === "Home") go(o[0]);
    else if (e.key === "End") go(o[o.length - 1]);
    else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div className={cn("relative inline-block", className)}>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-control items-center gap-2 rounded-lg px-3 text-sm font-medium hover:bg-mint-100"
      >
        {label}
      </button>
      {open && (
        <div ref={list} id={id} role="menu" onKeyDown={onKey} className="absolute right-0 z-nav mt-1 min-w-48 rounded-lg border border-line bg-surface p-1 shadow-2">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              type="button"
              disabled={it.disabled}
              onClick={() => {
                it.onSelect();
                close();
              }}
              className="flex min-h-control w-full items-center rounded-md px-3 text-left text-sm hover:bg-mint-100 disabled:opacity-50"
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
