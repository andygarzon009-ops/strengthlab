// Pairing logged sets with the heart-rate trace recorded during the workout.
//
// A set is ticked off when it ends, so `Set.loggedAt` marks the finish of the
// work, not the start. Heart rate lags the effort by several seconds and keeps
// climbing briefly after the bar is racked, so the reading that describes a set
// is the PEAK across a window straddling the tick — not the instantaneous value
// at it, which routinely catches the rise on its way up.
//
// The second signal is how fast the athlete comes back down. A big drop in the
// minute after the peak is a well-conditioned athlete on a manageable set; a
// flat line is a set that dug into their capacity (or a rest period that ended
// too early). Both go to the coach so it can read effort per set rather than
// guessing from load alone.
//
// Pure functions — no DB, no client/server split.

import { hrZone } from "@/lib/hrZones";

export type HrSample = { timestamp: Date; bpm: number };

export type SetHrReading = {
  /** Highest bpm across the set's effort window. */
  peakBpm: number;
  /** Peak as a % of the athlete's max HR. */
  pctMax: number;
  /** Zone the peak lands in (1–5), matching the charts' zone model. */
  zone: 1 | 2 | 3 | 4 | 5;
  /**
   * BPM shed in the minute after the peak — null when the next set started
   * too soon to measure it, or the trace has a gap there.
   */
  dropBpm: number | null;
};

// The work behind a set finishes at the tick, so the window reaches back far
// enough to cover the set itself and forward far enough to catch the lag.
const EFFORT_LEAD_MS = 45_000;
const EFFORT_LAG_MS = 30_000;
// Standard one-minute heart-rate recovery.
const RECOVERY_MS = 60_000;
// How far off the ideal recovery instant a sample may sit and still count.
// Fitbit emits roughly one reading every 5s during activity, so this is
// generous — it only bites when the trace has a real gap.
const RECOVERY_TOLERANCE_MS = 20_000;

/// Index of the first sample at or after `t`. Samples must be ascending.
function lowerBound(samples: HrSample[], t: number): number {
  let lo = 0;
  let hi = samples.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].timestamp.getTime() < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The heart-rate story of one set, or null when the trace doesn't cover it.
 *
 * @param samples      Ascending by timestamp.
 * @param nextLoggedAt When the following set was ticked, so recovery isn't
 *                     measured across work the athlete had already resumed.
 */
export function readSetHeartRate(
  loggedAt: Date,
  samples: HrSample[],
  maxHr: number,
  nextLoggedAt?: Date | null,
): SetHrReading | null {
  if (samples.length === 0 || maxHr <= 0) return null;

  const t = loggedAt.getTime();
  const from = t - EFFORT_LEAD_MS;
  const to = t + EFFORT_LAG_MS;

  let peakBpm = 0;
  let peakAt = 0;
  for (let i = lowerBound(samples, from); i < samples.length; i++) {
    const s = samples[i];
    const ts = s.timestamp.getTime();
    if (ts > to) break;
    if (s.bpm > peakBpm) {
      peakBpm = s.bpm;
      peakAt = ts;
    }
  }
  if (peakBpm <= 0) return null;

  const { zone, pctMax } = hrZone(peakBpm, maxHr);

  // Recovery is only meaningful across genuine rest. If the next set was
  // ticked before the minute was up, the athlete was already working again.
  let dropBpm: number | null = null;
  const target = peakAt + RECOVERY_MS;
  const nextEffortStarts = nextLoggedAt
    ? nextLoggedAt.getTime() - EFFORT_LEAD_MS
    : Infinity;
  if (target <= nextEffortStarts) {
    let best: HrSample | null = null;
    let bestGap = Infinity;
    for (
      let i = lowerBound(samples, target - RECOVERY_TOLERANCE_MS);
      i < samples.length;
      i++
    ) {
      const ts = samples[i].timestamp.getTime();
      if (ts > target + RECOVERY_TOLERANCE_MS) break;
      const gap = Math.abs(ts - target);
      if (gap < bestGap) {
        bestGap = gap;
        best = samples[i];
      }
    }
    if (best) dropBpm = Math.max(0, peakBpm - best.bpm);
  }

  return { peakBpm, pctMax, zone, dropBpm };
}

/**
 * Compact annotation for the coach's prompt: `hr168 Z4 -22/60s`.
 * Deliberately terse — this rides on every working set of every recent
 * session, so the token cost is paid many times over.
 */
export function formatSetHr(r: SetHrReading | null): string {
  if (!r) return "";
  const drop = r.dropBpm != null ? ` -${r.dropBpm}/60s` : "";
  return ` hr${r.peakBpm} Z${r.zone}${drop}`;
}

/// Group a flat sample list by workout, preserving ascending order.
export function groupSamplesByWorkout<
  T extends { workoutId: string; timestamp: Date; bpm: number },
>(rows: T[]): Map<string, HrSample[]> {
  const byWorkout = new Map<string, HrSample[]>();
  for (const row of rows) {
    const list = byWorkout.get(row.workoutId);
    if (list) list.push({ timestamp: row.timestamp, bpm: row.bpm });
    else byWorkout.set(row.workoutId, [{ timestamp: row.timestamp, bpm: row.bpm }]);
  }
  return byWorkout;
}
