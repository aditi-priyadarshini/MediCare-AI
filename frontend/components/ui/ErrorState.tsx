import { AlertTriangle } from "lucide-react";
import { Button } from "./primitives";

/** A failed load. Says what happened and offers a retry; never shows stale or invented data. */
export function ErrorState({
  title = "Something went wrong",
  children,
  onRetry,
  retryLabel = "Try again",
}: {
  title?: string;
  children?: React.ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div role="alert" className="rounded-card border border-danger-700/30 bg-danger-100 p-5 text-center">
      <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-danger-700" aria-hidden />
      <p className="font-semibold text-danger-700">{title}</p>
      {children && <p className="mt-1 text-sm text-ink">{children}</p>}
      {onRetry && (
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
