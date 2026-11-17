"use client";

import { useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export interface TabItem {
  id: string;
  label: string;
  content: React.ReactNode;
}

/** WAI-ARIA tabs: arrow keys move and select, Home/End jump. */
export function Tabs({ items, defaultId, label }: { items: TabItem[]; defaultId?: string; label: string }) {
  const base = useId();
  const [active, setActive] = useState(defaultId ?? items[0]?.id);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const move = (to: number) => {
    const item = items[(to + items.length) % items.length]!;
    setActive(item.id);
    refs.current[item.id]?.focus();
  };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: items.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    move(to);
  };

  return (
    <div>
      <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line">
        {items.map((t, i) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={on}
              aria-controls={`${base}-panel-${t.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(t.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                "min-h-control whitespace-nowrap border-b-2 px-4 text-sm font-medium transition-colors duration-fast",
                on ? "border-teal-700 text-teal-700" : "border-transparent text-ink-soft hover:text-ink",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {items.map((t) => (
        <div key={t.id} role="tabpanel" id={`${base}-panel-${t.id}`} aria-labelledby={`${base}-tab-${t.id}`} hidden={t.id !== active} tabIndex={0} className="pt-4">
          {t.id === active && t.content}
        </div>
      ))}
    </div>
  );
}
