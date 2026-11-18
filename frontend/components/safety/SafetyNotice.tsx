import { Alert } from "@/components/ui/primitives";

/** Short reminder shown on every safety tool page. */
export function SafetyNotice() {
  return (
    <Alert tone="info" title="A guide, not advice">
      Uses a small reference dataset and, if you allow it, an AI model that can be wrong. Finding nothing does not mean something is safe. Ask a pharmacist or your
      prescriber before you start, stop or change a medicine.
    </Alert>
  );
}
