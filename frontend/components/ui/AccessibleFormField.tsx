import { FieldShell } from "./primitives";

/**
 * Label + hint + error wired with aria-describedby / aria-invalid, for any control.
 * Usage: <AccessibleFormField label="Dose">{({id, describedBy, invalid}) => <input id={id} .../>}</AccessibleFormField>
 */
export const AccessibleFormField = FieldShell;
