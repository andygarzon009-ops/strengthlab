/// The body scan's colour: one continuous "heat" per muscle, on each muscle's
/// own recovery clock (lib/muscleRecovery.ts). Dark when untouched, cooling
/// blue as the work fades, green through lime as the week's volume builds,
/// then amber to red when the muscle is being loaded faster than it recovers.

import { recoveryFor } from "@/lib/muscleRecovery";

/// One muscle's recent work: each session in the last 7 days as hours ago,
/// effective sets (RIR-weighted, half credit as a helper muscle) and the raw
/// set count they came from — their ratio is how hard the session was.
export type MuscleSessions = { hoursAgo: number; sets: number; rawSets?: number }[];

/// How much one set counts, by reps in reserve. Sets closer to failure give
/// more growth stimulus (Robinson et al., Sports Med 2024, meta-regression of
/// proximity to failure) and cost more recovery — training to failure left
/// neuromuscular performance down 24–48 h longer than stopping short
/// (Morán-Navarro et al., Eur J Appl Physiol 2017). RIR 2 is the reference
/// set; an unlogged RIR counts as one.
export function rirWeight(rir: number | null | undefined): number {
  if (rir == null) return 1;
  if (rir <= 0) return 1.3;
  if (rir === 1) return 1.15;
  if (rir === 2) return 1;
  if (rir === 3) return 0.85;
  return 0.65;
}

/// A session's hardness (weighted ÷ raw sets) stretches or shortens the
/// recovery window: to-failure chest comes out ~94 h, in line with the 72–96 h
/// measured after bench to failure (Ferreira 2017).
function windowFor(baseHours: number, s: { sets: number; rawSets?: number }): number {
  const hardness = s.rawSets ? s.sets / s.rawSets : 1;
  return baseHours * Math.max(0.75, Math.min(1.3, hardness));
}

export type MuscleStat = {
  hoursSince: number; // since it was last trained
  weekSets: number; // effective sets, last 7 days
  /// Fatigue still left from earlier sessions when the latest one started,
  /// in units of one hard session (a third of the weekly ceiling).
  carryIn: number;
  recoveryHours: number;
  mrv: number;
};

/// Fatigue from a session decays exponentially; its window is when it's
/// essentially gone (~95%), so the time constant is a third of it.
export function summarize(muscle: string, sessions: MuscleSessions): MuscleStat | undefined {
  if (sessions.length === 0) return undefined;
  const { hours, mrv } = recoveryFor(muscle);
  const dose = mrv / 3;
  const sorted = [...sessions].sort((a, b) => a.hoursAgo - b.hoursAgo);
  const last = sorted[0];
  // Each earlier session's fatigue decays on its own window — a to-failure
  // session lingers longer than an easy one.
  const carryIn =
    sorted
      .slice(1)
      .reduce(
        (f, s) =>
          f + s.sets * Math.exp(-(s.hoursAgo - last.hoursAgo) / (windowFor(hours, s) / 3)),
        0,
      ) / dose;
  return {
    hoursSince: last.hoursAgo,
    weekSets: Math.round(sorted.reduce((n, s) => n + s.sets, 0) * 10) / 10,
    carryIn,
    recoveryHours: Math.round(windowFor(hours, last)),
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
