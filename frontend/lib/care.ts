/**
 * Care discovery (pharmacies, doctors, appointment requests): types and small pure helpers.
 *
 * Wording rules these helpers enforce: stock is only ever "reported by a source at a time", never
 * "available"; a request that was not sent says so; a credential is only "verified" when the API
 * says it is; and maps are a link-out to OpenStreetMap, not embedded tiles.
 */

export interface SourceBrief {
  name: string;
  publisher: string | null;
  url: string | null;
  licence: string | null;
  jurisdiction: string;
  retrieved_on: string;
}

export interface Freshness {
  state: "fresh" | "stale";
  observed_at: string;
  age_days: number;
  label: string;
}

export type Availability = "in_stock" | "low_stock" | "out_of_stock";

export interface Stock {
  state: "no_feed" | "reported";
  reported: Availability | null;
  price_amount: string | number | null;
  currency: string | null;
  pack_size_text: string | null;
  source_name: string | null;
  source_timestamp: string | null;
  freshness: Freshness | null;
  call_to_confirm: boolean;
  message: string;
}

export interface Pharmacy {
  id: string;
  name: string;
  address_line: string;
  city: string;
  state: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  hours_text: string | null;
  verification_status: "unverified" | "source_listed";
  source: SourceBrief;
  freshness: Freshness;
  distance_km: number | null;
  stock: Stock | null;
}

export type CredentialStatus = "unverified" | "source_listed" | "verified";

export interface Credential {
  qualification: string;
  registration_masked: string | null;
  issuing_authority: string | null;
  status: CredentialStatus;
  verified_at: string | null;
  verification_source: SourceBrief | null;
  label: string;
}

export interface Doctor {
  id: string;
  display_name: string;
  clinic_name: string | null;
  specialties: string[];
  languages: string[];
  address_line: string | null;
  city: string;
  state: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  booking_mode: "request_only" | "provider";
  appointment_note: string;
  credential_status: CredentialStatus;
  credential_label: string;
  credentials: Credential[];
  source: SourceBrief;
  freshness: Freshness;
  distance_km: number | null;
}

export interface CarePage<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  notice: string;
}

export type AppointmentStatus = "request_only" | "sent" | "confirmed" | "declined" | "cancelled";
export type Window = "any" | "morning" | "afternoon" | "evening";

export interface Appointment {
  id: string;
  doctor: { id: string; display_name: string; clinic_name: string | null; phone: string | null; city: string };
  preferred_date: string;
  preferred_window: Window;
  reason: string | null;
  mode: "request_only" | "provider";
  status: AppointmentStatus;
  status_text: string;
  provider_reference: string | null;
  provider_responded_at: string | null;
  provider_message: string | null;
  created_at: string;
}

export const WINDOWS: { value: Window; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
];

/** Build a query string, leaving out empty values. Values are encoded. */
export function queryString(params: Record<string, string | number | boolean | null | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "" || value === false) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

/**
 * A link that opens the place on openstreetmap.org in a new tab. Following it is the person's own
 * navigation, so no map tiles are loaded by this app and no tile-server usage policy is involved.
 */
export function osmLink(lat: number, lon: number): string {
  const la = lat.toFixed(6);
  const lo = lon.toFixed(6);
  return `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=17/${la}/${lo}`;
}

/** `tel:` href from a phone number, or null when it has no usable digits. */
export function telHref(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 5 ? `tel:${digits}` : null;
}

export function distanceLabel(km: number | null): string | null {
  if (km === null || km === undefined) return null;
  return km < 1 ? "Less than 1 km away" : `${km.toFixed(1)} km away`;
}

const AVAILABILITY_TEXT: Record<Availability, string> = {
  in_stock: "Reported in stock",
  low_stock: "Reported low in stock",
  out_of_stock: "Reported out of stock",
};

/**
 * One line for a stock report. Always "reported", always with who and when, and the call
 * prompt whenever the report is stale or missing. Never "available" or "in stock" on its own.
 */
export function stockHeadline(stock: Stock): string {
  if (stock.state === "no_feed" || !stock.reported) return "No stock information";
  return `${AVAILABILITY_TEXT[stock.reported]} by ${stock.source_name ?? "a source"}`;
}

export function priceText(stock: Stock): string | null {
  if (stock.price_amount === null || stock.price_amount === undefined || !stock.currency) return null;
  const amount = Number(stock.price_amount);
  if (!Number.isFinite(amount)) return null;
  const formatted = amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${stock.currency} ${formatted} as reported. The price may differ.`;
}

export const CREDENTIAL_TONE: Record<CredentialStatus, "success" | "info" | "warning"> = {
  verified: "success",
  source_listed: "info",
  unverified: "warning",
};

export const CREDENTIAL_BADGE: Record<CredentialStatus, string> = {
  verified: "Credentials verified",
  source_listed: "Credentials listed, not verified",
  unverified: "Credentials not verified",
};

export function formatDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function capitalise(text: string): string {
  return text.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

/** Dates a request can be made for: from today to 90 days ahead, as YYYY-MM-DD. */
export function bookingRange(now: Date = new Date()): { min: string; max: string } {
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const max = new Date(now);
  max.setDate(max.getDate() + 90);
  return { min: fmt(now), max: fmt(max) };
}

export const CAN_CANCEL: AppointmentStatus[] = ["request_only", "sent", "confirmed"];

export const STATUS_BADGE: Record<AppointmentStatus, { label: string; tone: "info" | "success" | "warning" | "danger" }> = {
  request_only: { label: "Saved here only. Not sent", tone: "warning" },
  sent: { label: "Sent. Waiting for the clinic", tone: "info" },
  confirmed: { label: "Confirmed by the clinic", tone: "success" },
  declined: { label: "Declined by the clinic", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "info" },
};
