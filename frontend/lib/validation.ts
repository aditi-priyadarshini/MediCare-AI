/** Client-side checks mirror the backend rules for fast feedback; the server is authoritative. */

export const PASSWORD_MIN = 10;

export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > 128) return "Use at most 128 characters.";
  if (/^\d+$/.test(password) || new Set(password).size < 4) return "That password is too simple.";
  if (email && password.toLowerCase() === email.trim().toLowerCase())
    return "Password must not match your email address.";
  return null;
}

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export const isE164 = (v: string) => /^\+[1-9]\d{7,14}$/.test(v);

export const isSixDigitCode = (v: string) => /^\d{6}$/.test(v.trim());

/** Turn "98765 43210" or "09876543210" style input into E.164, defaulting to India (+91). */
export function toE164(input: string, defaultCountry = "+91"): string {
  const cleaned = input.replace(/[\s()-]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  const digits = cleaned.replace(/^0+/, "");
  return `${defaultCountry}${digits}`;
}
