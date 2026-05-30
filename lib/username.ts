/// Username rules: 3–20 chars, lowercase letters/numbers/underscore, must
/// start with a letter. Normalized to lowercase so "@Andy" and "@andy" can't
/// both exist.

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
const USERNAME_RE = /^[a-z][a-z0-9_]{2,19}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@/, "");
}

/// Returns an error string if invalid, or null if the username is well-formed.
export function validateUsername(raw: string): string | null {
  const u = normalizeUsername(raw);
  if (u.length < USERNAME_MIN) return "Username is too short (min 3)";
  if (u.length > USERNAME_MAX) return "Username is too long (max 20)";
  if (!USERNAME_RE.test(u)) {
    return "Use letters, numbers, and underscores; start with a letter";
  }
  return null;
}
