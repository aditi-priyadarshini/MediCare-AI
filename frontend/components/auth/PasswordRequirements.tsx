import { Check, Circle } from "lucide-react";
import { passwordChecks } from "@/lib/validation";
import { cn } from "@/lib/cn";

/**
 * Password rules, ticked off as the person types. Each row says "met" or "not yet" in text,
 * so status is never colour alone. The server still decides; this is early feedback.
 */
export function PasswordRequirements({ password, email }: { password: string; email?: string }) {
  const checks = passwordChecks(password, email);
  return (
    <div className="rounded-lg bg-mint-100/60 px-3 py-2.5">
      <p className="text-xs font-semibold text-ink">Your password needs to be:</p>
      <ul className="mt-1.5 space-y-1">
        {checks.map((c) => (
          <li key={c.id} className={cn("flex items-start gap-2 text-sm", c.met ? "text-success-700" : "text-ink-soft")}>
            {c.met ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <Circle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            )}
            <span>
              {c.label}
              <span className="sr-only">{c.met ? " — done" : " — not yet"}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
