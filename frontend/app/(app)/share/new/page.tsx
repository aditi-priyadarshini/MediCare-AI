"use client";

import { CreateShareCard } from "@/components/sharing/CreateShareCard";
import { FormPage } from "@/components/ui/FormPage";

export default function NewSharePage() {
  return (
    <FormPage
      title="Share with someone"
      description="Show a chosen part of your health information to one person, for a limited time."
      backHref="/share"
      backLabel="Care sharing"
      width="max-w-4xl"
    >
      <CreateShareCard onCreated={() => {}} />
    </FormPage>
  );
}
