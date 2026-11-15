import { AssistantView } from "@/components/assistant/AssistantView";

export default function AssistantPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Assistant</h1>
        <p className="mt-1 text-ink-soft">
          Plain-language answers about your own records, with the source of every fact.
        </p>
      </div>
      <AssistantView />
    </div>
  );
}
