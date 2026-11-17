"use client";

import { Upload, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { checkUpload, formatBytes, UPLOAD_HELP } from "@/lib/records";

/**
 * File picker with a drop target. The real <input type="file"> is the control, so it works with a
 * keyboard and a screen reader; dropping a file is an extra. The type and size are checked here for
 * a friendlier message; the server checks the file's content again.
 */
export function FileDropzone({
  file,
  onFile,
  error,
  label = "File",
  optional = true,
  disabled,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  /** Problem from the server or the parent form. */
  error?: string;
  label?: string;
  optional?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [local, setLocal] = useState<string | null>(null);
  const shown = error ?? local;

  function take(f: File | null) {
    if (!f) {
      setLocal(null);
      onFile(null);
      return;
    }
    const problem = checkUpload(f);
    setLocal(problem);
    // A rejected file is not kept, so it can never be submitted by mistake.
    onFile(problem ? null : f);
    if (problem && input.current) input.current.value = "";
  }

  function clear() {
    take(null);
    if (input.current) input.current.value = "";
    input.current?.focus();
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">
        {label} {optional && <span className="font-normal text-ink-soft">(optional)</span>}
      </label>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!disabled) take(e.dataTransfer.files?.[0] ?? null);
        }}
        className={cn(
          "rounded-lg border-2 border-dashed p-4 text-center transition-colors duration-fast",
          over ? "border-teal-500 bg-mint-100" : "border-line bg-canvas",
          shown && "border-danger-700",
        )}
      >
        <Upload className="mx-auto h-6 w-6 text-ink-soft" aria-hidden />
        <p className="mt-1 text-sm text-ink">Drop a file here, or choose one</p>
        <input
          ref={input}
          id={id}
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          disabled={disabled}
          aria-describedby={`${id}-help${shown ? ` ${id}-err` : ""}`}
          aria-invalid={shown ? true : undefined}
          onChange={(e) => take(e.target.files?.[0] ?? null)}
          className="mx-auto mt-2 block w-full max-w-xs text-sm text-ink file:mr-3 file:min-h-control file:cursor-pointer file:rounded-lg file:border file:border-line file:bg-surface file:px-4 file:text-sm file:font-medium file:text-teal-700"
        />
        <p id={`${id}-help`} className="mt-2 text-xs text-ink-soft">
          {UPLOAD_HELP}
        </p>
      </div>
      {file && (
        <p className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-mint-100 px-3 py-2 text-sm text-ink">
          <span className="min-w-0 break-words">
            {file.name} <span className="text-ink-soft tnum">({formatBytes(file.size)})</span>
          </span>
          <button type="button" onClick={clear} aria-label={`Remove ${file.name} from this form`} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:bg-surface">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </p>
      )}
      {shown && (
        <p id={`${id}-err`} role="alert" className="mt-1 text-sm text-danger-700">
          {shown}
        </p>
      )}
    </div>
  );
}
