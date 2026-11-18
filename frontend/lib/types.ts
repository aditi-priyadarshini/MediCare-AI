export type Role = "patient" | "admin" | "doctor" | "caregiver";

export interface User {
  id: string;
  email: string;
  role: Role;
  email_verified: boolean;
  display_name: string | null;
}

export interface AuthState {
  user: User;
  csrf_token: string;
}

export interface AccessibilityPrefs {
  large_text: boolean;
  high_contrast: boolean;
  reduce_motion: boolean;
  voice_enabled: boolean;
}

export type Language = "en" | "hi" | "or";
export type BloodGroup = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";

export interface Profile {
  display_name: string;
  date_of_birth: string | null;
  preferred_language: Language;
  timezone: string;
  height_cm: number | null;
  weight_kg: number | null;
  blood_group: BloodGroup | null;
  blood_group_verification_status: string;
  accessibility_preferences: AccessibilityPrefs;
  onboarding_completed: boolean;
  completeness: number;
}

/** Fields the client may send; verification status and ownership are server-controlled. */
export type ProfileInput = Omit<
  Profile,
  "blood_group_verification_status" | "onboarding_completed" | "completeness"
>;

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export type VerificationStatus = "patient_reported" | "clinician_confirmed" | "imported" | "unverified";

export interface Condition {
  id: string;
  display_name: string;
  status: "active" | "resolved" | "inactive" | "entered_in_error";
  verification_status: VerificationStatus;
  onset_date: string | null;
  resolved_date: string | null;
}

export interface Allergy {
  id: string;
  substance: string;
  reaction: string | null;
  severity: "mild" | "moderate" | "severe" | "unknown" | null;
  verification_status: VerificationStatus;
  status: "active" | "entered_in_error";
}

export interface EmergencyContact {
  id: string;
  name: string;
  relationship: string | null;
  phone_e164: string;
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

export type RecordType =
  | "lab_report"
  | "prescription"
  | "imaging"
  | "discharge_summary"
  | "vaccination"
  | "other";

export interface HealthRecord {
  id: string;
  record_type: RecordType;
  title: string;
  record_date: string | null;
  provider_name: string | null;
  notes: string | null;
  status: "active" | "entered_in_error";
  verification_status: VerificationStatus;
  has_file: boolean;
  file_name: string | null;
  file_content_type: string | null;
  file_size: number | null;
  created_at: string;
}

export type LabFlag = "low" | "normal" | "high" | "unknown";

export interface LabResult {
  id: string;
  record_id: string | null;
  test_name: string;
  value_numeric: number | null;
  value_text: string | null;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  flag: LabFlag;
  observed_on: string;
  notes: string | null;
  status: "active" | "entered_in_error";
  verification_status: VerificationStatus;
}

export interface LabTestSummary {
  test_name: string;
  count: number;
  latest_observed_on: string;
  latest_value_numeric: number | null;
  latest_value_text: string | null;
  latest_unit: string | null;
  latest_flag: LabFlag;
}

export interface LabTrend {
  test_name: string;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  points: Array<{ id: string; observed_on: string; value: number; flag: LabFlag }>;
}

/* ------------------------------------------------------------------ medications */
export type MedicationStatus = "active" | "paused" | "stopped" | "entered_in_error";
export type MedicationBasis = "prescribed" | "self_reported";

export interface Medication {
  id: string;
  medicine_id: string | null;
  prescription_id: string | null;
  display_name: string;
  strength_text: string | null;
  form: string | null;
  dose_text: string | null;
  units_per_dose: number;
  instructions: string | null;
  reason: string | null;
  as_needed: boolean;
  basis: MedicationBasis;
  start_date: string | null;
  end_date: string | null;
  status: MedicationStatus;
  refill_threshold_days: number;
  verification_status: VerificationStatus;
  created_at: string;
}

export interface Prescription {
  id: string;
  record_id: string | null;
  prescriber_name: string | null;
  prescribed_on: string | null;
  valid_until: string | null;
  notes: string | null;
  status: "active" | "entered_in_error";
  verification_status: VerificationStatus;
}

export interface MedicineHit {
  id: string;
  name: string;
  form: string | null;
  strength_text: string | null;
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
  medication_id: string;
  lot_number: string | null;
  manufacturer: string | null;
  expiry_date: string | null;
  received_on: string | null;
  unit: string | null;
  quantity_initial: number;
  quantity_remaining: number;
  status: "active" | "discarded" | "entered_in_error";
}

export type DoseStatus = "pending" | "taken" | "skipped";

export interface Dose {
  id: string;
  medication_id: string;
  schedule_id: string | null;
  scheduled_at: string | null;
  status: DoseStatus;
  taken_at: string | null;
  note: string | null;
  supply_id: string | null;
  units_used: number | null;
  overdue: boolean;
  medication_name: string | null;
  dose_text: string | null;
}

export type AlertKind = "refill_soon" | "out_of_stock" | "expiring_soon" | "expired";

export interface MedAlert {
  kind: AlertKind;
  medication_id: string;
  medication_name: string;
  supply_id: string | null;
  lot_number: string | null;
  expiry_date: string | null;
  days_left: number | null;
  remaining: number | null;
}

export interface AppNotification {
  id: string;
  kind: "dose_due" | AlertKind;
  title: string;
  body: string;
  due_at: string;
  delivered_at: string | null;
  read_at: string | null;
  dose_log_id: string | null;
  medication_id: string | null;
}

/* ------------------------------------------------------------------ Phase 4: safety */
export type Severity = "unknown" | "minor" | "moderate" | "major" | "contraindicated";
export type SafetyOutcome = "findings" | "no_matching_record" | "insufficient_data";
export type SafetyKind = "drug_drug" | "drug_food" | "drug_condition";

export interface SafetySource {
  name: string;
  version: string;
  reviewed_at: string;
  jurisdiction: string;
}

export interface SafetyFinding {
  rule_id: string;
  kind: SafetyKind;
  severity: Severity;
  description: string;
  clinical_significance: string | null;
  guidance: string | null;
  source: SafetySource;
  medication_ids: string[];
  medication_names: string[];
  ingredient_names: string[];
  matched_term: string | null;
  conflict: boolean;
}

export interface AllergyFinding {
  allergy_id: string;
  allergy_text: string;
  allergy_severity: string | null;
  medication_id: string;
  medication_name: string;
  ingredient_name: string;
  basis: "ingredient_name" | "curated_term" | "drug_class";
  source: SafetySource;
}

export interface SafetyCheck {
  outcome: SafetyOutcome;
  findings: SafetyFinding[];
  allergy_findings: AllergyFinding[];
  duplicates: { ingredient_name: string; medication_ids: string[]; medication_names: string[] }[];
  unmapped_medications: string[];
  checked_medications: number;
  notes: string[];
  disclaimer: string;
}

export type SafetyCheckName = "drug-drug" | "drug-condition" | "drug-food" | "allergy";
export type SafetyChecks = Record<SafetyCheckName, SafetyCheck>;

/* Personalised assessment: one overall status plus the issues behind it. There is deliberately
   no "safe" status: the calmest one is "no_matching_record". */
export type SafetyStatus = "needs_attention" | "review" | "no_matching_record" | "insufficient_data";
export type IssueSection = "drug_drug" | "drug_condition" | "drug_food" | "allergy" | "duplicate";
export type EffectFrequency = "very_common" | "common" | "uncommon" | "rare" | "unknown";
export type EffectSeriousness = "mild" | "moderate" | "serious";

export interface SafetyIssue {
  section: IssueSection;
  severity: Severity;
  title: string;
  detail: string;
  guidance: string | null;
  medication_names: string[];
  source: SafetySource | null;
}

export interface AdverseEffect {
  id: string;
  ingredient_name: string;
  effect: string;
  frequency: EffectFrequency;
  seriousness: EffectSeriousness;
  when_to_get_help: string | null;
  source: SafetySource;
}

export interface PersonalContext {
  medications: number;
  conditions: number;
  allergies: number;
  foods: number | null;
}

export type CheckKey = "drug_drug" | "drug_condition" | "drug_food" | "allergy";

export interface SafetyOverview {
  status: SafetyStatus;
  counts: { needs_attention: number; review: number };
  issues: SafetyIssue[];
  checks: Record<CheckKey, SafetyCheck>;
  watch_for: { medication_id: string | null; medication_name: string; effects: AdverseEffect[] }[];
  context: PersonalContext;
  notes: string[];
  disclaimer: string;
}

export interface PersonalCheck {
  medicine: { id: string; name: string; form: string | null; strength_text: string | null; ingredients: string[] };
  already_taking: boolean;
  status: SafetyStatus;
  counts: { needs_attention: number; review: number };
  issues: SafetyIssue[];
  checks: Record<CheckKey, SafetyCheck>;
  effects: AdverseEffect[];
  context: PersonalContext;
  notes: string[];
  disclaimer: string;
}

export type ExplainMode = "ai" | "evidence_only" | "fallback" | "consent_required";
export interface Explanation {
  mode: ExplainMode;
  text: string;
  evidence: { ref: string; text: string }[];
  status: SafetyStatus | null;
  disclaimer: string;
}

export interface Price {
  source_name: string;
  price: string;
  currency: string;
  pack_quantity: string;
  pack_unit: string;
  unit_price: string;
  jurisdiction: string;
  observed_at: string;
  age_days: number;
  stale: boolean;
}

export interface MedicineCard {
  id: string;
  name: string;
  form: string | null;
  strength_text: string | null;
  route: string | null;
  release_type: string | null;
  ingredients: { name: string; strength_value: string | null; strength_unit: string | null }[];
  prices: Price[];
}

export interface Alternatives {
  subject: MedicineCard;
  status: "candidates" | "no_candidates" | "insufficient_data";
  candidates: { medicine: MedicineCard; differences: string[]; label: "candidate" }[];
  missing: string[];
  excluded_incomplete: number;
  notice: string;
  price_notice: string;
}

export interface Authenticity {
  status: "verified" | "mismatch" | "suspicious_for_review" | "unable_to_verify";
  detail: string;
  source: string | null;
  checked_at: string;
  note: string;
}

export type AdrSeverity = "mild" | "moderate" | "severe";
export type AdrOutcome = "recovered" | "ongoing" | "unknown";

export interface AdverseEvent {
  id: string;
  medication_id: string | null;
  medication_name: string;
  reaction: string;
  onset_date: string | null;
  severity: AdrSeverity;
  outcome: AdrOutcome;
  notes: string | null;
  record_id: string | null;
  status: "submitted" | "entered_in_error";
  created_at: string;
  notice: string;
}

/* ------------------------------------------------------------------ assistant (Phase 5) */
export type ContextKey = "medicines" | "history" | "labs" | "doses" | "allergies";
export type AssistantContext = Record<ContextKey, boolean>;
export type AssistantLanguage = "en" | "hi" | "or";
export type AssistantMode = "llm" | "evidence_only" | "fallback" | "canned";

export interface AssistantStatus {
  mode: "llm" | "evidence_only";
  provider: string;
  model: string | null;
  consent_granted: boolean;
  notices: string[];
}

export interface EvidenceItem {
  id: string;
  ref: string;
  source_type:
    | "lab_result"
    | "medication"
    | "dose_log"
    | "condition"
    | "allergy"
    | "health_record"
    | "reference"
    | "derived";
  source_record_id: string | null;
  source_label: string;
  recorded_at: string | null;
  verification_status: string | null;
  cited: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  safety_classification: string | null;
  mode: AssistantMode | null;
  created_at: string;
  evidence: EvidenceItem[];
}

export interface ChatSessionBrief {
  id: string;
  title: string;
  language: AssistantLanguage;
  created_at: string;
  updated_at: string;
}

export interface ChatSessionDetail extends ChatSessionBrief {
  context: AssistantContext;
  consent_granted: boolean;
  messages: ChatMessage[];
}

export interface AskResult {
  user_message: ChatMessage;
  assistant_message: ChatMessage;
}

export type AiPairSeverity =
  "major" | "moderate" | "minor" | "none_reported" | "unknown";
export type AiPairState =
  "curated" | "ai_note" | "ai_none_reported" | "ai_unsure" | "not_checked";
export type AiPairsMode =
  | "ai"
  | "partial"
  | "consent_required"
  | "ai_unavailable"
  | "too_few"
  | "too_many";
export interface AiPair {
  medication_a: string;
  medication_b: string;
  state: AiPairState;
  curated: {
    severity: string;
    description: string;
    guidance: string | null;
    source: string;
  }[];
  ai_severity: AiPairSeverity | null;
  ai_note: string | null;
}
export interface AiPairsResult {
  mode: AiPairsMode;
  message: string;
  medicines: number;
  pairs: AiPair[];
  ai_label: string;
  disclaimer: string;
}
