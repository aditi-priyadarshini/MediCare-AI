"use client";

import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks";

/** Rendered only when the backend reports Google OAuth as configured. */
export function GoogleButton() {
  const providers = useAsync(() => api<{ google: boolean }>("/auth/providers"), []);
  if (!providers.data?.google) return null;
  return (
    <>
      <div className="flex items-center gap-3 text-sm text-ink-soft" role="separator">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      {/* Full navigation (not fetch): the OAuth flow redirects the browser to Google. */}
      <a
        href="/api/v1/auth/google/start"
        className="flex min-h-control w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface text-sm font-semibold text-ink transition-colors duration-fast hover:bg-mint-100"
      >
        Continue with Google
      </a>
    </>
  );
}
