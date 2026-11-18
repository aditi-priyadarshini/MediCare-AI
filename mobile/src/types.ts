/** Shapes returned by the MediCare AI API (see the schemas.py files under backend/app). */
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuthState {
  user: { id: string; email: string; role: string; email_verified: boolean; display_name: string | null };
  csrf_token: string;
}

export interface Profile {
  display_name: string;
  date_of_birth: string | null;
  preferred_language: string;
  timezone: string;
  height_cm: number | null;
  weight_kg: number | null;
  blood_group: string | null;
  blood_group_verification_status: string;
  onboarding_completed: boolean;
  completeness: number;
}
export interface Condition {
  id: string;
  display_name: string;
  status: string;
  verification_status: string;
  onset_date: string | null;
}
export interface Allergy {
  id: string;
  substance: string;
  reaction: string | null;
  severity: string | null;
  status: string;
}
export interface Contact {
  id: string;
  name: string;
  relationship: string | null;
  email: string | null;
  is_primary: boolean;
}
export type ConsentType =
  | "terms_of_service"
  | "privacy_policy"
  | "health_data_processing"
  | "ai_context"
  | "reminder_email"
  | "reminder_call";
export interface Consent {
  consent_type: ConsentType;
  granted: boolean;
  policy_version: string | null;
  recorded_at: string | null;
  required: boolean;
}

export type MedicationStatus = "active" | "paused" | "stopped" | "entered_in_error";
export interface Medication {
  id: string;
  display_name: string;
  strength_text: string | null;
  form: string | null;
  dose_text: string | null;
  units_per_dose: number;
  instructions: string | null;
  reason: string | null;
  as_needed: boolean;
  basis: "prescribed" | "self_reported";
  start_date: string | null;
  end_date: string | null;
  status: MedicationStatus;
  refill_threshold_days: number;
  verification_status: string;
}
export interface Schedule {
  id: string;
  medication_id: string;
  timezone: string;
  times: string[];
  days_of_week: number[] | null;
  every_n_days: number;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
}
export interface Supply {
  id: string;
  lot_number: string | null;
  expiry_date: string | null;
  unit: string | null;
  quantity_initial: number;
  quantity_remaining: number;
  status: string;
}
export interface Dose {
  id: string;
  medication_id: string;
  scheduled_at: string | null;
  status: "pending" | "taken" | "skipped";
  taken_at: string | null;
  overdue: boolean;
  medication_name: string | null;
  dose_text: string | null;
}
export interface Alert {
  kind: "refill_soon" | "out_of_stock" | "expiring_soon" | "expired";
  medication_id: string;
  medication_name: string;
  expiry_date: string | null;
  days_left: number | null;
  remaining: number | null;
}
export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  due_at: string;
  read_at: string | null;
}

export type SafetyStatus = "needs_attention" | "review" | "no_matching_record" | "insufficient_data";
export interface SafetyIssue {
  section: string;
  severity: string;
  title: string;
  detail: string;
  guidance: string | null;
  medication_names: string[];
}
export interface SafetyOverview {
  status: SafetyStatus;
  counts: { needs_attention: number; review: number };
  issues: SafetyIssue[];
  notes: string[];
  disclaimer: string;
  context: { medications: number; conditions: number; allergies: number };
}

export interface RecordItem {
  id: string;
  record_type: string;
  title: string;
  record_date: string | null;
  provider_name: string | null;
  notes: string | null;
  verification_status: string;
  has_file: boolean;
  file_name: string | null;
}
export interface LabSummary {
  test_name: string;
  count: number;
  latest_observed_on: string;
  latest_value_numeric: number | null;
  latest_value_text: string | null;
  latest_unit: string | null;
  latest_flag: "low" | "normal" | "high" | "unknown";
}
export interface LabTrend {
  test_name: string;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  points: { id: string; observed_on: string; value: number; flag: string }[];
}

export interface Evidence {
  id: string;
  ref: string;
  source_label: string;
  source_type: string;
  recorded_at: string | null;
  cited: boolean;
}
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  safety_classification: string | null;
  mode: string | null;
  created_at: string;
  evidence: Evidence[];
}
export interface SessionBrief {
  id: string;
  title: string;
  language: string;
  updated_at: string;
}
export interface SessionDetail extends SessionBrief {
  consent_granted: boolean;
  messages: ChatMessage[];
}
export interface AssistantStatus {
  mode: "llm" | "evidence_only";
  provider: string;
  model: string | null;
  consent_granted: boolean;
  notices: string[];
}

export interface Doctor {
  id: string;
  display_name: string;
  clinic_name: string | null;
  specialties: string[];
  languages: string[];
  address_line: string | null;
  city: string;
  phone: string | null;
  credential_label: string;
  appointment_note: string;
}
export interface Pharmacy {
  id: string;
  name: string;
  address_line: string;
  city: string;
  phone: string | null;
  hours_text: string | null;
}
export interface CareSearch<T> extends Page<T> {
  notice: string;
}

export interface EmergencySummary {
  generated_at: string;
  display_name: string;
  blood_group: string | null;
  allergies: { substance: string; reaction: string | null; severity: string | null }[] | null;
  conditions: { display_name: string }[] | null;
  medications: { display_name: string }[] | null;
  contacts: { name: string; relationship: string | null; phone?: string | null; email?: string | null }[] | null;
  limitations: string[];
}
export interface EmergencyStatus {
  emergency_number: string;
  dispatch_available: boolean;
}

export interface Share {
  id: string;
  recipient_name: string;
  recipient_email: string;
  categories: string[];
  expires_at: string;
  revoked_at: string | null;
  access_count: number;
  status: "active" | "expired" | "revoked";
}

export type CallStatus = "ringing" | "answered" | "completed" | "declined" | "missed" | "failed";
export interface Call {
  id: string;
  status: CallStatus;
  ring_expires_at: string;
  created_at?: string;
  end_reason?: string | null;
  media_connected_at?: string | null;
}
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}
export interface Accept {
  call: Call;
  dose: {
    dose_id: string;
    medication_name: string;
    dose_text: string | null;
    scheduled_at: string | null;
    status: string;
    spoken_text: string;
  };
  ticket: string;
  ws_path: string;
  ice_servers: IceServer[];
}
export interface Device {
  id: string;
  platform: string;
  app_version: string | null;
  last_seen_at: string;
  can_ring: boolean;
}
