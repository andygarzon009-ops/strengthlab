/// The body scan's colour: one continuous "heat" per muscle rather than a few
/// buckets, so the map reads as a gradient — dark when untouched, cooling blue
/// as work fades, green through lime as the week's volume builds, then amber
/// and red past what the muscle can recover from.
///
/// heat 0      untouched for a week or more
/// heat ~0.3   trained, but days ago (stale)
/// heat ~0.5   fresh, light volume
/// heat ~1.0   fresh, ~20 sets this week — the top of the productive range
/// heat >1.0   overworked: past 20 sets, or hit three days running

export type MuscleStat = { days: number; sets: number; streak: number };

/// Weekly sets that count as a full week's work for one muscle (the top of the
/// hypertrophy spec's 10–20).
const FULL_WEEK_SETS = 20;

export function muscleHeat(m: MuscleStat | undefined): number {
  if (!m || m.days >= 7) return 0;
  // Recency fades over the week; the power keeps a 2-day-old session warm.
  const recency = Math.pow(1 - m.days / 7, 0.7);
  const volume = Math.min(m.sets / FULL_WEEK_SETS, 1);
  let heat = recency * (0.35 + 0.65 * volume);
  // Past the full week, jump into the warning end of the scale so overwork
  // reads as orange-red, not as a slightly yellower green.
  if (m.sets > FULL_WEEK_SETS) {
    heat = 1.16 + Math.min((m.sets - FULL_WEEK_SETS) / 10, 1) * 0.14;
  }
  if (m.streak >= 3) heat = Math.max(heat, 1.2);
  return heat;
}

/// Stops along the scale, as [heat, [r, g, b]].
export const HEAT_STOPS: [number, [number, number, number]][] = [
  [0, [38, 38, 44]], // untouched
  [0.18, [30, 64, 140]], // deep blue
  [0.34, [59, 130, 246]], // blue — stale
  [0.5, [34, 197, 94]], // green — fresh
  [0.78, [132, 225, 60]], // bright green
  [1.0, [190, 242, 60]], // lime — peak
  [1.12, [250, 175, 40]], // amber — tipping over
  [1.3, [239, 68, 68]], // red — overworked
];
export const HEAT_MAX = 1.3;

export function heatColor(heat: number): string {
  const h = Math.max(0, Math.min(HEAT_MAX, heat));
  for (let i = 1; i < HEAT_STOPS.length; i++) {
    const [h1, c1] = HEAT_STOPS[i];
    if (h <= h1) {
      const [h0, c0] = HEAT_STOPS[i - 1];
      const t = (h - h0) / (h1 - h0 || 1);
      const c = c0.map((v, k) => Math.round(v + (c1[k] - v) * t));
      return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    }
  }
  const [, c] = HEAT_STOPS[HEAT_STOPS.length - 1];
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/// The scale as a CSS gradient, for the legend bar.
export const HEAT_GRADIENT = `linear-gradient(90deg, ${HEAT_STOPS.map(
  ([h, c]) => `rgb(${c.join(", ")}) ${((h / HEAT_MAX) * 100).toFixed(1)}%`,
).join(", ")})`;
