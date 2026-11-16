/** Types and small pure helpers for the admin console and the patient feedback form. */

export interface AdminOverview {
  users: number;
  inactive_users: number;
  feedback_new: number;
  rules_active: number;
  rules_unreviewed: number;
  sources: number;
  medicines: number;
}

export interface AdminUserRow {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
  email_verified: boolean;
  created_at: string;
}

export interface AuditRow {
  id: string;
  actor_user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  ip: string | null;
  request_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type FeedbackStatus = "new" | "reviewed" | "actioned" | "dismissed";
export type FeedbackCategory = "general" | "bug" | "accessibility" | "content" | "other";

export interface FeedbackRow {
  id: string;
  category: FeedbackCategory;
  message: string;
  page: string | null;
  status: FeedbackStatus;
  created_at: string;
}

export interface AdminFeedbackRow extends FeedbackRow {
  user_id: string;
  moderator_note: string | null;
  moderated_by_user_id: string | null;
  moderated_at: string | null;
}

export const CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  general: "General",
  bug: "Something is broken",
  accessibility: "Accessibility",
  content: "Wrong or unclear content",
  other: "Other",
};

/** What the sender sees. Deliberately plain: it never implies a clinical outcome. */
export const SENDER_STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: "Received",
  reviewed: "Read by the team",
  actioned: "Acted on",
  dismissed: "Closed",
};

export type Severity = "unknown" | "minor" | "moderate" | "major" | "contraindicated";
export type RuleKind = "drug_drug" | "drug_food" | "drug_condition";

export interface AdminRule {
  id: string;
  kind: RuleKind;
  ingredient_id: string;
  counterpart_ingredient_id: string | null;
  counterpart_term: string | null;
  severity: Severity;
  description: string;
  clinical_significance: string | null;
  guidance: string | null;
  source_id: string;
  source_version: string;
  reviewed_at: string;
  jurisdiction: string;
  status: "active" | "retired";
  retired_at: string | null;
  created_at: string;
  version: number;
  supersedes_rule_id: string | null;
  review_status: "unreviewed" | "approved";
  reviewed_by_user_id: string | null;
  peer_reviewed_at: string | null;
  created_by_user_id: string | null;
}

export interface AdminIngredient {
  id: string;
  name: string;
}

export interface AdminSource {
  id: string;
  name: string;
  publisher: string | null;
  url: string | null;
  licence: string | null;
  jurisdiction: string;
  version: string;
  reviewed_at: string;
}

export interface AdminMedicine {
  id: string;
  name: string;
  form: string | null;
  strength_text: string | null;
  source: string;
}

export const RULE_KIND_LABEL: Record<RuleKind, string> = {
  drug_drug: "Medicine + medicine",
  drug_food: "Medicine + food",
  drug_condition: "Medicine + condition",
};

export const SEVERITIES: Severity[] = ["unknown", "minor", "moderate", "major", "contraindicated"];

/** Short, readable audit action: "admin.rule_create" -> "Rule create". */
export function actionLabel(action: string): string {
  const [, ...rest] = action.split(".");
  const text = (rest.join(" ") || action).replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Review state in words. "Unreviewed" is stated plainly: a live rule may still await a second person. */
export function reviewLabel(rule: Pick<AdminRule, "review_status" | "status">): string {
  if (rule.status === "retired") return "Replaced or retired";
  return rule.review_status === "approved" ? "Reviewed by a second administrator" : "Awaiting second-person review";
}

/** Whether the signed-in admin may approve this rule: not their own, not retired, not already approved. */
export function canReview(rule: AdminRule, adminId: string): boolean {
  return rule.status === "active" && rule.review_status !== "approved" && rule.created_by_user_id !== adminId;
}

/** ISO bounds for a date input (local midnight to next local midnight), or undefined when empty. */
export function dayStartIso(value: string): string | undefined {
  return value ? new Date(`${value}T00:00:00`).toISOString() : undefined;
}
export function dayEndIso(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

export interface LlmProviderRow {
  position: number;
  name: string;
  kind: string;
  model: string;
  host: string;
  calls: number;
  failures: number;
  consecutive_failures: number;
  cooling_down: boolean;
  last_ok_at: string | null;
  last_error: string | null;
}

export interface LlmProviders {
  configured: boolean;
  providers: LlmProviderRow[];
}

export interface LlmTestResult {
  name: string;
  ok: boolean;
  latency_ms: number;
  error: string | null;
}

export const KIND_LABEL: Record<string, string> = {
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  openai_compatible: "OpenAI-compatible (NVIDIA NIM, OpenRouter, …)",
};

/** One plain-words state per provider; never colour alone. */
export function providerState(p: Pick<LlmProviderRow, "cooling_down" | "consecutive_failures" | "calls">): string {
  if (p.cooling_down) return "Paused after repeated failures";
  if (p.consecutive_failures > 0) return "Last request failed";
  return p.calls === 0 ? "Not used yet" : "Working";
}
