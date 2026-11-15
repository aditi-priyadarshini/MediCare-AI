"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  Loader2,
  ShieldCheck,
  UserCheck,
  HelpCircle,
  FileDown,
  type LucideIcon,
} from "lucide-react";
import { forwardRef, useId, useState } from "react";
import { cn } from "@/lib/cn";

/* ----------------------------------------------------------------- Button */
type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-teal-700 text-white hover:bg-brand-900 disabled:bg-teal-700/50",
  secondary: "bg-surface text-ink border border-line hover:bg-mint-100",
  ghost: "text-teal-700 hover:bg-mint-100",
  danger: "bg-danger-700 text-white hover:opacity-90 disabled:opacity-50",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  variant = "primary",
  loading,
  fullWidth,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold",
        "transition-colors disabled:cursor-not-allowed",
        VARIANTS[variant],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ Field */
interface FieldShellProps {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode;
}

export function FieldShell({ label, error, hint, optional, children }: FieldShellProps) {
  const id = useId();
  const describedBy = [error && `${id}-err`, hint && `${id}-hint`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
        {optional && <span className="ml-1 font-normal text-ink-soft">(optional)</span>}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-ink-soft">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="flex items-start gap-1.5 text-xs font-medium text-danger-700">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

const inputClass = (invalid: boolean) =>
  cn(
    "min-h-[44px] w-full rounded-lg border bg-surface px-3 text-base text-ink placeholder:text-ink-soft/70",
    invalid ? "border-danger-700" : "border-line",
  );

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
};

export const TextField = forwardRef<HTMLInputElement, InputProps>(function TextField(
  { label, error, hint, optional, className, ...rest },
  ref,
) {
  return (
    <FieldShell label={label} error={error} hint={hint} optional={optional}>
      {({ id, describedBy, invalid }) => (
        <input
          ref={ref}
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn(inputClass(invalid), className)}
          {...rest}
        />
      )}
    </FieldShell>
  );
});

export const PasswordField = forwardRef<HTMLInputElement, InputProps>(function PasswordField(
  { label, error, hint, className, ...rest },
  ref,
) {
  const [visible, setVisible] = useState(false);
  return (
    <FieldShell label={label} error={error} hint={hint}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <input
            ref={ref}
            id={id}
            type={visible ? "text" : "password"}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className={cn(inputClass(invalid), "pr-12", className)}
            {...rest}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-ink-soft hover:text-ink"
          >
            {visible ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      )}
    </FieldShell>
  );
});

type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "id"> & {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  options: Array<{ value: string; label: string }>;
};

export function SelectField({ label, error, hint, optional, options, className, ...rest }: SelectProps) {
  return (
    <FieldShell label={label} error={error} hint={hint} optional={optional}>
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn(inputClass(invalid), className)}
          {...rest}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
}

export function CheckboxField({
  label,
  description,
  className,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "id"> & {
  label: string;
  description?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <input
        id={id}
        type="checkbox"
        aria-describedby={description ? `${id}-d` : undefined}
        className="mt-1 h-5 w-5 shrink-0 accent-teal-700"
        {...rest}
      />
      <label htmlFor={id} className="text-sm">
        <span className="font-medium text-ink">{label}</span>
        {description && (
          <span id={`${id}-d`} className="mt-0.5 block text-ink-soft">
            {description}
          </span>
        )}
      </label>
    </div>
  );
}

/* ------------------------------------------------------------ Card / Alert */
export function Card({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("rounded-card border border-line bg-surface p-5 shadow-sm", className)} {...rest}>
      {children}
    </section>
  );
}

type Tone = "info" | "success" | "warning" | "danger";
const TONES: Record<Tone, { box: string; icon: LucideIcon; label: string }> = {
  info: { box: "bg-info-100 text-info-700 border-info-700/30", icon: Info, label: "Information" },
  success: { box: "bg-success-100 text-success-700 border-success-700/30", icon: CheckCircle2, label: "Success" },
  warning: { box: "bg-amber-100 text-amber-600 border-amber-600/30", icon: AlertTriangle, label: "Caution" },
  danger: { box: "bg-danger-100 text-danger-700 border-danger-700/30", icon: AlertTriangle, label: "Error" },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const t = TONES[tone];
  const Icon = t.icon;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-lg border p-3 text-sm", t.box, className)}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div>
        <p className="font-semibold">{title ?? t.label}</p>
        {children && <div className="mt-0.5 text-ink">{children}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Badge */
const STATUS: Record<string, { label: string; icon: LucideIcon; cls: string }> = {
  patient_reported: { label: "Patient reported", icon: UserCheck, cls: "bg-info-100 text-info-700" },
  clinician_confirmed: { label: "Clinician confirmed", icon: ShieldCheck, cls: "bg-success-100 text-success-700" },
  imported: { label: "Imported", icon: FileDown, cls: "bg-mint-100 text-teal-700" },
  unverified: { label: "Needs review", icon: HelpCircle, cls: "bg-amber-100 text-amber-600" },
};

export function VerificationBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.unverified!;
  const Icon = s.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", s.cls)}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {s.label}
    </span>
  );
}

/* ---------------------------------------------------------- Loading states */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-line/60", className)} />;
}

export function PageLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="mx-auto max-w-3xl space-y-4 p-6">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-4 py-6 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <p className="mt-1 text-sm text-ink-soft">{children}</p>}
    </div>
  );
}
