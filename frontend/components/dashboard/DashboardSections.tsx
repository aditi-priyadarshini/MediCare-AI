"use client";

import { HealthTimeline } from "@/components/dashboard/HealthTimeline";
import { LabHighlights } from "@/components/dashboard/LabHighlights";
import { ProfileCompletion } from "@/components/dashboard/ProfileCompletion";
import { api } from "@/lib/api-client";
import { missingProfileItems } from "@/lib/dashboard";
import { useAsync, type AsyncState } from "@/lib/hooks";
import { useProfile } from "@/lib/profile-context";
import type { Dose, EmergencyContact, LabResult, Page } from "@/lib/types";

/** Profile completion plus the emergency-contact count (left out of the missing list if that call fails). */
export function CompletionTile() {
  const { profile } = useProfile();
  const contacts = useAsync(() => api<Page<EmergencyContact>>("/emergency/contacts?limit=1"), []);
  return <ProfileCompletion percent={profile.completeness} missing={missingProfileItems(profile, contacts.data ? contacts.data.total : null)} />;
}

/** Recent activity and lab highlights share one labs request. Not rendered in Easy-read mode. */
export function HealthSection({ doses }: { doses: AsyncState<Page<Dose>> }) {
  const labs = useAsync(() => api<Page<LabResult>>("/labs?limit=50"), []);
  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <HealthTimeline doses={doses} labs={labs} />
      </div>
      <div className="lg:col-span-5">
        <LabHighlights labs={labs} />
      </div>
    </div>
  );
}
