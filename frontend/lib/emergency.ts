/**
 * Emergency (Phase 8): types and wording helpers.
 *
 * The practice ambulance flow is always labelled as a simulation. Nothing in this module can make
 * a status look like a real dispatch.
 */
import type { VerificationStatus } from "./types";

export const EMERGENCY_NUMBER = "112";
export const CALL_HREF = `tel:${EMERGENCY_NUMBER}`;

export type SimulationStatus = "requested" | "acknowledged" | "en_route" | "arrived" | "cancelled";

export interface EmergencySettings {
  include_blood_group: boolean;
  include_allergies: boolean;
  include_conditions: boolean;
  include_medications: boolean;
  include_contacts: boolean;
}

export interface EmergencyStatus {
  emergency_number: string;
  dispatch_available: boolean;
}

export interface EmergencySummary {
  generated_at: string;
  display_name: string;
  blood_group: string | null;
  blood_group_verification_status: VerificationStatus | null;
  allergies: Array<{ substance: string; reaction: string | null; severity: string | null; verification_status: VerificationStatus }> | null;
  conditions: Array<{ display_name: string; verification_status: VerificationStatus }> | null;
  medications: Array<{ display_name: string; strength_text: string | null; dose_text: string | null; status: string }> | null;
  contacts: Array<{ name: string; relationship: string | null; phone_e164: string; is_primary: boolean }> | null;
  settings: EmergencySettings;
  limitations: string[];
}

export interface Simulation {
  id: string;
  is_simulation: true;
  notice: string;
  status: SimulationStatus;
  location_shared: boolean;
  is_open: boolean;
  next_status: SimulationStatus | null;
  history: Array<{ status: SimulationStatus; at: string }>;
  created_at: string;
  updated_at: string;
}

export interface Dispatch {
  is_simulation: false;
  status: "accepted_by_provider";
  provider_reference: string;
  accepted_at: string;
  notice: string;
}

export const SETTING_ROWS: Array<{ key: keyof EmergencySettings; label: string; hint: string }> = [
  { key: "include_blood_group", label: "Blood group", hint: "Shown with its verification status." },
  { key: "include_allergies", label: "Allergies", hint: "Active allergies, most severe first." },
  { key: "include_contacts", label: "Emergency contacts", hint: "Names, relationships and phone numbers." },
  { key: "include_conditions", label: "Conditions", hint: "Off by default. Turn on only if you want a responder to see them." },
  { key: "include_medications", label: "Current medicines", hint: "Off by default. A listed medicine is not proof you are taking it." },
];

/** What each practice step means. Every one says it is practice. */
export const STEP_LABEL: Record<SimulationStatus, string> = {
  requested: "Practice request made",
  acknowledged: "Practice: request acknowledged",
  en_route: "Practice: ambulance on the way",
  arrived: "Practice: ambulance arrived",
  cancelled: "Practice run cancelled",
};

export const FLOW: SimulationStatus[] = ["requested", "acknowledged", "en_route", "arrived"];

/** `tel:` link for a stored E.164 number; null when it has no usable digits. */
export function telFor(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 5 ? `tel:${digits}` : null;
}

/** Latitude/longitude as text for a responder, rounded to what a phone can really tell you. */
export function coordsText(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}
