import { Alert } from "@/components/ui/primitives";

/** Short reminder shown on every safety tool page. */
export function SafetyNotice() {
  return (
    <Alert tone="info" title="Prototype: answers come from AI">
      The AI can be wrong or incomplete, and “no interaction found” does not mean something is safe. Ask a pharmacist or your
      prescriber before you start, stop or change a medicine.
    </Alert>
  );
}
