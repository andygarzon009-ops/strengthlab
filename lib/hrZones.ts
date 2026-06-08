// Heart-rate intensity zones, shared by the live in-workout widget and any
// post-workout HR views that want the same model. Pure functions — safe to
// import on client or server.

export type HrZoneInfo = {
  zone: 1 | 2 | 3 | 4 | 5;
  label: string;
  color: string;
  pctMax: number;
};

// Standard 5-zone model keyed by % of max HR. Labels/colors match the rest of
// the app's HR styling (red = hardest, as used on the heart-rate charts).
const ZONE_LABELS = ["Very light", "Light", "Moderate", "Hard", "Peak"];
const ZONE_COLORS = ["#3b82f6", "#22c55e", "#eab308", "#f97316", "#ef4444"];

// Generic fallback max HR when we can't estimate one (no birthday, no history).
const FALLBACK_MAX_HR = 190;

/// Age in whole years from a birth date, or null if unknown/implausible.
export function ageFromBirthDate(birthDate: Date | null | undefined): number | null {
  if (!birthDate) return null;
  const age = Math.floor(
    (Date.now() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
  );
  return age > 0 && age < 120 ? age : null;
}

/// Estimated max HR. The age formula (220 − age) is the standard rough
/// estimate; we take the higher of it and any HR the athlete has actually been
/// observed hitting, since a real measured max beats the formula. Falls back to
/// a generic value when neither is available.
export function estimateMaxHr(
  age: number | null,
  observedMax: number | null,
): number {
  const ageBased = age && age > 0 ? 220 - age : null;
  const candidates = [ageBased, observedMax].filter(
    (x): x is number => typeof x === "number" && x > 0,
  );
  return candidates.length ? Math.max(...candidates) : FALLBACK_MAX_HR;
}

/// Which intensity zone a BPM reading falls into, given the athlete's max HR.
export function hrZone(bpm: number, maxHr: number): HrZoneInfo {
  const pctMax = Math.round((bpm / maxHr) * 100);
  let idx: number;
  if (pctMax < 60) idx = 0;
  else if (pctMax < 70) idx = 1;
  else if (pctMax < 80) idx = 2;
  else if (pctMax < 90) idx = 3;
  else idx = 4;
  return {
    zone: (idx + 1) as 1 | 2 | 3 | 4 | 5,
    label: ZONE_LABELS[idx],
    color: ZONE_COLORS[idx],
    pctMax,
  };
}
