/// The body scan's colour: one continuous "heat" per muscle, on each muscle's
/// own recovery clock (lib/muscleRecovery.ts). Dark when untouched, cooling
/// blue as the work fades, green through lime as the week's volume builds,
/// then amber to red when the muscle is being loaded faster than it recovers.

import { recoveryFor } from "@/lib/muscleRecovery";

/// One muscle's recent work: each session in the last 7 days as hours ago
/// and effective working sets (half credit when it was a helper muscle).
export type MuscleSessions = { hoursAgo: number; sets: number }[];

export type MuscleStat = {
  hoursSince: number; // since it was last trained
  weekSets: number; // effective sets, last 7 days
  /// Fatigue still left from earlier sessions when the latest one started,
  /// in units of one hard session (a third of the weekly ceiling).
  carryIn: number;
  recoveryHours: number;
  mrv: number;
};

/// Fatigue from a session decays exponentially; `hours` is when it's
/// essentially gone (~95%), so the time constant is a third of it.
export function summarize(muscle: string, sessions: MuscleSessions): MuscleStat | undefined {
  if (sessions.length === 0) return undefined;
  const { hours, mrv } = recoveryFor(muscle);
  const tau = hours / 3;
  const dose = mrv / 3;
  const sorted = [...sessions].sort((a, b) => a.hoursAgo - b.hoursAgo);
  const last = sorted[0];
  const carryIn =
    sorted
      .slice(1)
      .reduce((f, s) => f + s.sets * Math.exp(-(s.hoursAgo - last.hoursAgo) / tau), 0) / dose;
  return {
    hoursSince: last.hoursAgo,
    weekSets: Math.round(sorted.reduce((n, s) => n + s.sets, 0) * 10) / 10,
    carryIn,
    recoveryHours: hours,
    mrv,
  };
}

/// Trained again with over a third of a hard session's fatigue still
/// unrecovered (back-to-back heavy leg or chest days land here; back-to-back
/// arms or core, which clear fatigue faster, don't), or past the weekly
/// ceiling — and still inside the recovery window.
const CARRY_LIMIT = 0.35;
export function isOverworked(m: MuscleStat | undefined): boolean {
  if (!m || m.hoursSince >= m.recoveryHours) return false;
  return m.weekSets > m.mrv || m.carryIn >= CARRY_LIMIT;
}

/// Hours until the muscle is recovered from its last session (0 = ready).
export function hoursToRecovered(m: MuscleStat | undefined): number {
  if (!m) return 0;
  return Math.max(0, Math.round(m.recoveryHours - m.hoursSince));
}

export function muscleHeat(m: MuscleStat | undefined): number {
  if (!m) return 0;
  // Fades on the muscle's own clock: core goes stale in ~3½ days, quads ~6.
  const fade = Math.max(0, 1 - m.hoursSince / (2.5 * m.recoveryHours));
  if (fade === 0) return 0;
  if (isOverworked(m)) {
    const excess = Math.max(m.weekSets / m.mrv - 1, m.carryIn - CARRY_LIMIT);
    return 1.16 + Math.min(Math.max(excess, 0) * 2, 1) * 0.14;
  }
  const volume = Math.min(m.weekSets / m.mrv, 1);
  return Math.pow(fade, 0.7) * (0.35 + 0.65 * volume);
}

/// Stops along the scale, as [heat, [r, g, b]].
export const HEAT_STOPS: [number, [number, number, number]][] = [
  [0, [38, 38, 44]], // untouched
  [0.18, [30, 64, 140]], // deep blue
  [0.34, [59, 130, 246]], // blue — stale
  [0.5, [34, 197, 94]], // green — fresh
  [0.78, [132, 225, 60]], // bright green
  [1.0, [190, 242, 60]], // lime — at the weekly ceiling
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
