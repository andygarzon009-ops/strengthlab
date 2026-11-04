// Pure sleep scoring, split out of lib/recovery (which is server-only) so
// client components can score a night they render.
//
// Google Health doesn't expose its sleep score through the API, so this
// rebuilds it the way its Sleep screen explains it: half sleep duration, half
// sleep quality, where quality is how many of five measures — awake,
// restlessness, REM, light, deep — sat inside your own typical range (mean ±
// one standard deviation of the nights before). Checked against the Google
// Health app on 2026-11-04: 7h 18m asleep, light and deep out of range →
// "2 of 5 out of range", score 71 on both.

export type ScoreNight = {
  asleepMin: number;
  deepMin: number;
  remMin: number;
  lightMin: number;
  awakeMin: number;
  /// Short awakenings, summed — Google's "Restlessness". Missing on nights
  /// synced before it was captured; those skip that measure.
  restlessMin?: number;
};

const MEASURES = [
  ["awakeMin", "Awake"],
  ["restlessMin", "Restlessness"],
  ["remMin", "REM"],
  ["lightMin", "Light"],
  ["deepMin", "Deep"],
] as const;

/// Fewer prior nights than this and a "typical range" means nothing.
const MIN_BASELINE = 5;
const BASELINE_NIGHTS = 30;

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export type SleepScore = {
  score: number;
  /// 0–100: four hours asleep scores 0, eight or more 100.
  duration: number;
  /// 0–100: share of the measures inside their typical range.
  quality: number;
  /// Labels of the measures outside their typical range.
  outOfRange: string[];
  /// How many measures had enough history to judge.
  checked: number;
};

/// Score a night against the nights before it (`prior`, any order — only the
/// most recent BASELINE_NIGHTS are used, so pass oldest → newest).
export function scoreSleep(night: ScoreNight, prior: ScoreNight[]): SleepScore {
  const duration = clamp(((night.asleepMin - 240) / (480 - 240)) * 100, 0, 100);
  const base = prior.slice(-BASELINE_NIGHTS);
  const outOfRange: string[] = [];
  let checked = 0;
  for (const [key, label] of MEASURES) {
    const v = night[key];
    const xs = base.map((n) => n[key]).filter((x): x is number => typeof x === "number");
    if (typeof v !== "number" || xs.length < MIN_BASELINE) continue;
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    checked++;
    if (v < mean - sd || v > mean + sd) outOfRange.push(label);
  }
  // Not enough history yet: judge by the deep + REM share instead.
  const quality = checked
    ? ((checked - outOfRange.length) / checked) * 100
    : clamp(((((night.deepMin + night.remMin) / (night.asleepMin || 1)) * 100 - 20) / 30) * 100, 0, 100);
  return {
    score: Math.round(0.5 * duration + 0.5 * quality),
    duration: Math.round(duration),
    quality: Math.round(quality),
    outOfRange,
    checked,
  };
}

/// Google's bands for the score.
export function sleepScoreBand(score: number): "Excellent" | "Good" | "Fair" | "Poor" {
  return score >= 90 ? "Excellent" : score >= 80 ? "Good" : score >= 60 ? "Fair" : "Poor";
}
