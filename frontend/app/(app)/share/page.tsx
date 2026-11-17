"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { ShareList } from "@/components/sharing/ShareList";
import { LinkButton } from "@/components/ui/LinkButton";
import { PageHeader } from "@/components/ui/PageHeader";

export default function SharePage() {
  const [version, setVersion] = useState(0);
  return (
    <div className="space-y-6">
      <PageHeader
        className="mb-0"
        title="Share your records"
        description="Show a chosen part of your health information to one person, for a limited time."
        actions={
          <LinkButton href="/share/new">
            <Plus className="h-4 w-4" aria-hidden /> Share with someone
          </LinkButton>
        }
      />
      <details className="rounded-card border border-info-700/30 bg-info-100 p-4 text-sm">
        <summary className="min-h-[44px] cursor-pointer font-semibold text-info-700">How sharing works</summary>
        <p className="mt-1 text-ink">
          You choose exactly what is shown and for how long. The person gets a link and must also enter a one-time code emailed to
          the address you give. You can see every time it was opened and withdraw access whenever you like. Attached documents and
          your private notes are never shared.
        </p>
      </details>
      <ShareList version={version} onChanged={() => setVersion((v) => v + 1)} />
    </div>
  );
}
