"use client";

import { useState } from "react";
import { CreateShareCard } from "@/components/sharing/CreateShareCard";
import { ShareList } from "@/components/sharing/ShareList";
import { Alert } from "@/components/ui/primitives";

export default function SharePage() {
  const [version, setVersion] = useState(0);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Share your records</h1>
        <p className="mt-1 text-ink-soft">Show a chosen part of your health information to one person, for a limited time.</p>
      </div>
      <Alert tone="info" title="How sharing works">
        You choose exactly what is shown and for how long. The person gets a link and must also enter a one-time code
        emailed to the address you give. You can see every time it was opened and withdraw access whenever you like.
        Attached documents and your private notes are never shared.
      </Alert>
      <CreateShareCard onCreated={() => setVersion((v) => v + 1)} />
      <ShareList version={version} onChanged={() => setVersion((v) => v + 1)} />
    </div>
  );
}
