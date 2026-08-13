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

import { hrZone, hrZoneBands } from "@/lib/hrZones";

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

// --- Time in zone ---------------------------------------------------------
//
// How long the session actually spent at each intensity. The coach can't
// derive this — it never sees the raw trace — so it's computed here and handed
// over as finished numbers.

export type ZoneSlice = {
  zone: 1 | 2 | 3 | 4 | 5;
  label: string;
  minBpm: number;
  /** null on the open-ended top zone. */
  maxBpm: number | null;
  seconds: number;
  /** Share of the covered time, 0–100, rounded to one decimal. */
  pct: number;
};

export type ZoneDistribution = {
  /** Total seconds the trace covers — not the workout's wall-clock length. */
  totalSeconds: number;
  /** Only zones with time in them, hardest first. */
  slices: ZoneSlice[];
};

// Each reading owns the span until the next one. A watch that drops out for
// ten minutes would otherwise donate all ten to whatever zone it was in when
// it stopped, so a span longer than this counts as a gap and is discarded.
const MAX_SPAN_MS = 60_000;

export function zoneDistribution(
  samples: HrSample[],
  maxHr: number,
): ZoneDistribution | null {
  if (samples.length < 2 || maxHr <= 0) return null;

  const bands = hrZoneBands(maxHr);
  const seconds = new Map<number, number>();
  let total = 0;

  for (let i = 0; i < samples.length - 1; i++) {
    const span =
      samples[i + 1].timestamp.getTime() - samples[i].timestamp.getTime();
    if (span <= 0 || span > MAX_SPAN_MS) continue;
    const { zone } = hrZone(samples[i].bpm, maxHr);
    seconds.set(zone, (seconds.get(zone) ?? 0) + span / 1000);
    total += span / 1000;
  }
  if (total <= 0) return null;

  const slices = bands
    .map((b) => ({
      zone: b.zone,
      label: b.label,
      minBpm: b.minBpm,
      maxBpm: b.maxBpm,
      seconds: Math.round(seconds.get(b.zone) ?? 0),
      pct: Math.round(((seconds.get(b.zone) ?? 0) / total) * 1000) / 10,
    }))
    .filter((s) => s.seconds > 0)
    .sort((a, b) => b.zone - a.zone);

  return { totalSeconds: Math.round(total), slices };
}

function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * One line carrying everything a time-in-zone table needs: the zone, its BPM
 * range, how long was spent there, and the share of the session.
 */
export function formatZoneDistribution(d: ZoneDistribution | null): string {
  if (!d) return "";
  const parts = d.slices.map((s) => {
    // The bottom zone is open downward and the top zone open upward; only the
    // middle ones are a true span.
    const range =
      s.maxBpm == null
        ? `${s.minBpm}+bpm`
        : s.minBpm <= 0
          ? `<${s.maxBpm}bpm`
          : `${s.minBpm}-${s.maxBpm - 1}bpm`;
    return `Z${s.zone} ${s.label} ${range} ${mmss(s.seconds)} ${s.pct}%`;
  });
  return `HR zones over ${mmss(d.totalSeconds)} of trace: ${parts.join(" | ")}`;
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
