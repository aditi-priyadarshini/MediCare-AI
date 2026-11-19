"use client";

import { useState } from "react";
import { AiSafetyPanel } from "@/components/safety/AiSafetyPanel";
import { SafetyNotice } from "@/components/safety/SafetyNotice";
import { PageHeader } from "@/components/ui/PageHeader";
import { cn } from "@/lib/cn";
import { AI_MODES, type AiSafetyMode } from "@/lib/safety-ai";

export default function Page() {
  const [mode, setMode] = useState<AiSafetyMode>("drug_drug");
  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Safety Checker"
        description="Every answer here comes from the AI. Type two medicines, review everything you take, check a food, or send a photo. Ask again as often as you like."
      />
      <SafetyNotice />
      <div role="tablist" aria-label="What do you want to check?" className="flex flex-wrap gap-2">
        {AI_MODES.map((m) => (
          <button
            key={m.mode}
            type="button"
            role="tab"
            aria-selected={mode === m.mode}
            onClick={() => setMode(m.mode)}
            className={cn(
              "min-h-[44px] rounded-full border px-4 text-sm font-medium",
              mode === m.mode ? "border-teal-700 bg-teal-700 text-white" : "border-line bg-surface text-ink hover:bg-mint-100",
            )}
          >
            {m.tab}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        <AiSafetyPanel key={mode} mode={mode} autoRun={mode === "my_medicines"} />
      </div>
    </div>
  );
}
