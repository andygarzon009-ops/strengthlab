// Between-set heart-rate recovery: how far HR falls in the first 60 s of rest
// after a hard set. Found from the HR trace alone (set log times are often
// entered in a batch, so they can't mark the rests): a peak that clearly rose
// out of the previous trough, followed by 60 s with no new peak and no
// rebound — i.e. a real rest, not the middle of a superset. Wrist HR is noisy
// during lifting, so the session's figure is the median of the clean rests,
// and it's only reported with enough of them.

export type HrPoint = { t: number; bpm: number }; // t in ms

export type HrRecovery = {
  /// Median drop in bpm 60 s after a set's peak.
  dropBpm: number;
  /// How many rests it's measured from.
  rests: number;
};

const WINDOW_MS = 60_000;
const PEAK_SPAN_MS = 30_000; // a peak is the highest point within ±30 s
const MIN_RISE = 12; // bpm a set must lift HR above the trough before it
const MIN_PEAK = 100; // below this it wasn't a hard set
const REBOUND = 4; // bpm HR may rise off its low in the last 20 s and still be resting
const MIN_RESTS = 4;
const MAX_GAP_MS = 15_000; // coverage: no hole longer than this inside a rest

/// HR at time t: the nearest sample within 5 s, else null.
function at(points: HrPoint[], t: number, from: number): number | null {
  let best: HrPoint | null = null;
  for (let i = from; i < points.length; i++) {
    const p = points[i];
    if (p.t > t + 5000) break;
    if (Math.abs(p.t - t) <= 5000 && (!best || Math.abs(p.t - t) < Math.abs(best.t - t))) best = p;
  }
  return best ? best.bpm : null;
}

export function measureHrRecovery(raw: HrPoint[]): HrRecovery | null {
  const points = [...raw].sort((a, b) => a.t - b.t);
  if (points.length < 60) return null;
  const drops: number[] = [];
  let lastPeakT = -Infinity;
  let trough = points[0].bpm;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    trough = Math.min(trough, p.bpm);
    if (p.bpm < MIN_PEAK || p.bpm - trough < MIN_RISE || p.t - lastPeakT < WINDOW_MS) continue;

    // Highest point within ±30 s (first of equals, so a plateau counts once).
    let isPeak = true;
    for (let j = i - 1; j >= 0 && points[j].t >= p.t - PEAK_SPAN_MS; j--) {
      if (points[j].bpm >= p.bpm) { isPeak = false; break; }
    }
    for (let j = i + 1; isPeak && j < points.length && points[j].t <= p.t + PEAK_SPAN_MS; j++) {
      if (points[j].bpm > p.bpm) isPeak = false;
    }
    if (!isPeak) continue;

    // The 60 s after it must be a real rest: covered by samples, never back
    // up to the peak, and not climbing again at the end (next set started).
    const rest: HrPoint[] = [];
    for (let j = i + 1; j < points.length && points[j].t <= p.t + WINDOW_MS + 5000; j++) rest.push(points[j]);
    if (rest.length < 8) continue;
    let gapOk = true;
    let prevT = p.t;
    for (const r of rest) {
      if (r.t - prevT > MAX_GAP_MS) { gapOk = false; break; }
      prevT = r.t;
    }
    if (!gapOk || rest.some((r) => r.bpm >= p.bpm)) continue;
    const hr60 = at(points, p.t + WINDOW_MS, i);
    if (hr60 == null) continue;
    const tail = rest.filter((r) => r.t >= p.t + WINDOW_MS - 20_000 && r.t <= p.t + WINDOW_MS);
    const low = Math.min(...tail.map((r) => r.bpm));
    if (hr60 - low > REBOUND) continue;

    drops.push(p.bpm - hr60);
    lastPeakT = p.t;
    trough = hr60;
  }

  if (drops.length < MIN_RESTS) return null;
  const sorted = drops.sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { dropBpm: Math.round(median), rests: drops.length };
}

/// Which past sessions count as "the same workout": same type and split, and
/// a deload only against deloads (a deload isn't a fair comparison for a
/// heavy week).
export function isDeloadSession(w: { isDeload: boolean; title: string }): boolean {
  return w.isDeload || /\bdeload\b/i.test(w.title);
}

export type RecoveryVerdict = "faster" | "slower" | "typical" | "first";

/// Today against the athlete's usual for this workout. Only "faster" or
/// "slower" when the gap is clearly beyond session-to-session noise: at
/// least 4 bpm and 1.5× the usual spread.
export function compareRecovery(
  today: number,
  previous: number[],
): { verdict: RecoveryVerdict; usual: number | null } {
  if (previous.length === 0) return { verdict: "first", usual: null };
  const mean = previous.reduce((s, v) => s + v, 0) / previous.length;
  const sd =
    previous.length > 1
      ? Math.sqrt(previous.reduce((s, v) => s + (v - mean) ** 2, 0) / (previous.length - 1))
      : 0;
  const threshold = Math.max(4, 1.5 * sd);
  const diff = today - mean;
  return {
    verdict: diff >= threshold ? "faster" : diff <= -threshold ? "slower" : "typical",
    usual: Math.round(mean),
  };
}
