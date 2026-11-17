import {
  Apple,
  FileText,
  FlaskConical,
  HeartPulse,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  MessageSquarePlus,
  Pill,
  Settings,
  ShieldCheck,
  Share2,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import type { MessageKey } from "@/lib/i18n";

/**
 * The ONE place that says which pages exist in the signed-in app. The sidebar, the mobile bar and
 * drawer, the breadcrumbs and the command palette all read from here, so adding a page means
 * adding a row below and nothing else. Only routes that really exist belong here
 * (tests/shell.test.tsx checks every href against app/(app)/).
 *
 * Feedback and Admin are English only (README, Phase 9), so their labels are plain text.
 */
export type NavLabel = { key: MessageKey } | { text: string };
export type NavGroupId = "overview" | "health" | "care" | "account" | "admin";

export interface NavRoute {
  href: string;
  icon: LucideIcon;
  label: NavLabel;
  /** Shorter label for the 4 slots of the mobile bar. */
  shortLabel?: NavLabel;
  group: NavGroupId;
  adminOnly?: boolean;
  /** One of the four primary slots on the mobile bar (the fifth is "More"). */
  mobilePrimary?: boolean;
  /** Extra words the command palette matches, besides the label. */
  keywords?: string[];
}

export const NAV_GROUPS: Array<{ id: NavGroupId; label: NavLabel; adminOnly?: boolean }> = [
  { id: "overview", label: { key: "nav.group.overview" } },
  { id: "health", label: { key: "nav.group.myHealth" } },
  { id: "care", label: { key: "nav.group.care" } },
  { id: "account", label: { key: "nav.group.account" } },
  { id: "admin", label: { text: "Admin" }, adminOnly: true },
];

export const NAV_ROUTES: NavRoute[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: { key: "nav.dashboard" }, shortLabel: { key: "nav.home" }, group: "overview", mobilePrimary: true, keywords: ["home", "overview"] },

  { href: "/profile", icon: HeartPulse, label: { key: "nav.healthProfile" }, group: "health", keywords: ["profile", "allergies", "conditions", "emergency contacts", "consent"] },
  { href: "/records", icon: FileText, label: { key: "nav.medicalRecords" }, shortLabel: { key: "nav.records" }, group: "health", mobilePrimary: true, keywords: ["documents", "reports", "upload"] },
  { href: "/labs", icon: FlaskConical, label: { key: "nav.labResults" }, group: "health", keywords: ["tests", "blood", "trends"] },
  { href: "/medications", icon: Pill, label: { key: "nav.medications" }, shortLabel: { key: "nav.medicines" }, group: "health", mobilePrimary: true, keywords: ["medicines", "doses", "reminders", "pills"] },
  { href: "/diet", icon: Apple, label: { key: "nav.dietWellness" }, group: "health", keywords: ["food", "nutrition", "meal"] },

  { href: "/assistant", icon: MessageSquare, label: { key: "nav.aiAssistant" }, shortLabel: { key: "nav.askAi" }, group: "care", mobilePrimary: true, keywords: ["ai", "chat", "ask", "question"] },
  { href: "/safety", icon: ShieldAlert, label: { key: "nav.safetyChecker" }, group: "care", keywords: ["interactions", "check medicine", "allergy"] },
  { href: "/care", icon: MapPin, label: { key: "nav.care" }, group: "care", keywords: ["doctor", "pharmacy", "appointment", "hospital"] },
  { href: "/share", icon: Share2, label: { key: "nav.careSharing" }, group: "care", keywords: ["share", "link", "caregiver", "doctor summary"] },

  { href: "/feedback", icon: MessageSquarePlus, label: { text: "Feedback" }, group: "account", keywords: ["report a problem", "suggestion"] },
  { href: "/settings", icon: Settings, label: { key: "nav.settings" }, group: "account", keywords: ["language", "text size", "contrast", "voice", "preferences", "accessibility"] },

  { href: "/admin", icon: ShieldCheck, label: { text: "Admin" }, group: "admin", adminOnly: true, keywords: ["administration", "rules", "accounts", "audit"] },
];

/** Sub-pages of /admin: used for breadcrumbs and for the admin tab strip. */
export const ADMIN_PAGES: Array<{ href: string; label: string }> = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/rules", label: "Safety rules" },
  { href: "/admin/reference", label: "Sources & catalogue" },
  { href: "/admin/ai", label: "AI providers" },
  { href: "/admin/feedback", label: "Feedback" },
  { href: "/admin/accounts", label: "Accounts" },
  { href: "/admin/audit", label: "Audit log" },
];

/** Shortcuts that only navigate: the palette never performs an action on health data. */
export interface QuickAction {
  id: string;
  label: MessageKey;
  href: string;
  icon: LucideIcon;
  keywords: string[];
}
export const QUICK_ACTIONS: QuickAction[] = [
  { id: "upload", label: "action.uploadReport", href: "/records", icon: FileText, keywords: ["upload", "report", "scan", "document", "add"] },
  { id: "add-med", label: "action.addMedication", href: "/medications", icon: Pill, keywords: ["add", "medicine", "medication", "new"] },
  { id: "ask-ai", label: "action.askAi", href: "/assistant", icon: MessageSquare, keywords: ["ask", "ai", "question", "chat"] },
  { id: "check", label: "action.checkSafety", href: "/safety", icon: ShieldAlert, keywords: ["check", "interaction", "safety", "medicine"] },
];

export const MOBILE_PRIMARY = NAV_ROUTES.filter((r) => r.mobilePrimary);

export const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

export const routesFor = (isAdmin: boolean) => NAV_ROUTES.filter((r) => !r.adminOnly || isAdmin);

export function groupedRoutes(isAdmin: boolean) {
  return NAV_GROUPS.filter((g) => !g.adminOnly || isAdmin)
    .map((g) => ({ ...g, routes: routesFor(isAdmin).filter((r) => r.group === g.id) }))
    .filter((g) => g.routes.length > 0);
}

export const labelText = (label: NavLabel, t: (key: MessageKey) => string) => ("key" in label ? t(label.key) : label.text);

/**
 * Trail for the top bar. Top-level pages return [] (a breadcrumb that repeats the page title adds
 * nothing); only nested pages, today the admin console, have one.
 */
export const SAFETY_PAGES = [
  { href: "/safety/medicines", label: "My medicines" },
  { href: "/safety/lookup", label: "Look up a medicine" },
  { href: "/safety/alternatives", label: "Compare medicines" },
  { href: "/safety/report", label: "Note a side effect" },
  { href: "/safety/authenticity", label: "Is this pack genuine?" },
];

export function breadcrumbsFor(pathname: string): Array<{ href: string; label: string }> {
  if (pathname.startsWith("/safety/")) {
    const page = SAFETY_PAGES.find((p) => p.href === pathname);
    return page ? [{ href: "/safety", label: "Safety Checker" }, { href: page.href, label: page.label }] : [];
  }
  if (!pathname.startsWith("/admin/")) return [];
  const page = ADMIN_PAGES.find((p) => p.href === pathname);
  return page ? [{ href: "/admin", label: "Admin" }, { href: page.href, label: page.label }] : [];
}
