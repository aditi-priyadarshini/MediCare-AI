"use client";

import { X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";

type ToastTone = "info" | "success" | "danger";
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}
interface ToastApi {
  show: (message: string, tone?: ToastTone) => void;
}

const Ctx = createContext<ToastApi>({ show: () => {} });
export const useToast = () => useContext(Ctx);

const TONE_CLS: Record<ToastTone, string> = {
  info: "border-info-700/40 bg-surface text-ink",
  success: "border-success-700/40 bg-surface text-ink",
  danger: "border-danger-700/60 bg-danger-100 text-ink",
};

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useCallback(() => {
    if (item.tone === "danger") return; // errors stay until dismissed
    timer.current = setTimeout(() => onDismiss(item.id), 6000);
  }, [item, onDismiss]);
  const pause = () => timer.current && clearTimeout(timer.current);

  // Start the timer on mount via ref callback; pause on hover/focus so it can be read.
  return (
    <div
      ref={(el) => {
        if (el && !timer.current) start();
      }}
      role={item.tone === "danger" ? "alert" : "status"}
      onMouseEnter={pause}
      onFocus={pause}
      onMouseLeave={() => {
        pause();
        start();
      }}
      onBlur={() => {
        pause();
        start();
      }}
      className={cn("flex items-start gap-3 rounded-lg border p-3 text-sm shadow-2", TONE_CLS[item.tone])}
    >
      <p className="flex-1">{item.message}</p>
      <button type="button" aria-label="Dismiss message" onClick={() => onDismiss(item.id)} className="flex h-8 w-8 items-center justify-center rounded-md text-ink-soft hover:text-ink">
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const show = useCallback((message: string, tone: ToastTone = "info") => setItems((l) => [...l, { id: next.current++, tone, message }]), []);
  const api = useMemo(() => ({ show }), [show]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-toast flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastView item={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
