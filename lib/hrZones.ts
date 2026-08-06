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

/// Lower bound of each zone as a % of max HR. The single source for both
/// hrZone() and hrZoneBands(), so a reading's colour can never disagree with
/// the band it's plotted inside.
const ZONE_PCT_FLOORS = [0, 60, 70, 80, 90] as const;

export const HR_ZONE_LABELS: readonly string[] = ZONE_LABELS;
export const HR_ZONE_COLORS: readonly string[] = ZONE_COLORS;

/// Dot spacing per zone, tightening as intensity rises. Colour alone carries
/// the zone otherwise, which fails for anyone who can't separate the green
/// from the orange — the pattern says the same thing a second way.
const ZONE_DASH = ["1 9", "1 7", "1 5", "1 3.5", "1 2.5"];

export function hrZoneDash(zone: 1 | 2 | 3 | 4 | 5): string {
  return ZONE_DASH[zone - 1];
}

export type HrZoneBand = {
  zone: 1 | 2 | 3 | 4 | 5;
  label: string;
  color: string;
  /** SVG stroke-dasharray for this zone's threshold line. */
  dash: string;
  /** Inclusive lower bound in BPM. */
  minBpm: number;
  /** Exclusive upper bound in BPM; null for the top zone, which is open. */
  maxBpm: number | null;
};

/// The five zones expressed in BPM for a given max HR, so a chart can draw
/// threshold lines and a legend in the same colours the readings use.
export function hrZoneBands(maxHr: number): HrZoneBand[] {
  return ZONE_PCT_FLOORS.map((pct, i) => {
    const nextPct = ZONE_PCT_FLOORS[i + 1];
    return {
      zone: (i + 1) as 1 | 2 | 3 | 4 | 5,
      label: ZONE_LABELS[i],
      color: ZONE_COLORS[i],
      dash: ZONE_DASH[i],
      minBpm: Math.round((pct / 100) * maxHr),
      maxBpm: nextPct != null ? Math.round((nextPct / 100) * maxHr) : null,
    };
  });
}

/// Just the colour for a reading — the common case in chart rendering, where
/// pulling the whole HrZoneInfo per point is wasteful.
export function hrZoneColor(bpm: number, maxHr: number): string {
  return hrZone(bpm, maxHr).color;
}

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
