// Readiness: how ready the body is to train today, 0–100.
//
// Google Health doesn't expose Fitbit's own Daily Readiness score, so this is
// ours. The core is the old recovery blend — last night's sleep, overnight
// HRV and resting HR, each against the athlete's own baseline. On top of that
// three signals can only take points away, because none of them ever means
// "extra ready": a skin-temperature spike, a raised breathing rate (both
// early illness / heavy-fatigue tells), and a training-load spike from what
// was actually logged in StrengthLab over the last two days.
//
// Pure: no I/O, so the same math scores today and backfills the trend.

export type ReadinessBand = "low" | "moderate" | "primed";

export function readinessBand(score: number): ReadinessBand {
  if (score >= 67) return "primed";
  if (score >= 34) return "moderate";
  return "low";
}

export type FactorKey = "sleep" | "hrv" | "rhr" | "temp" | "resp" | "load";
export type FactorStatus = "good" | "ok" | "drag";

/// One line in the "what moved it" breakdown. Core factors carry their 0–100
/// sub-score; modifiers carry the points they took off (0 when quiet).
export type ReadinessFactor = {
  key: FactorKey;
  status: FactorStatus;
  value: string; // "7h 12m", "48 ms", "+0.6°C"
  note: string; // "baseline 52 ms", "2.1× your usual"
  score?: number; // core factors
  penalty?: number; // modifiers
};

export const FACTOR_LABEL: Record<FactorKey, string> = {
  sleep: "Sleep",
  hrv: "HRV",
  rhr: "Resting HR",
  temp: "Skin temp",
  resp: "Breathing",
  load: "Training load",
};

export type ReadinessInputs = {
  sleepScore: number | null; // 0–100 from lib/sleepScore
  asleepMin: number | null;
  hrv: { now: number; baseline: number } | null;
  rhr: { now: number; baseline: number } | null;
  temp: { nightlyC: number; baselineC: number; stddevC: number | null } | null;
  resp: { now: number; baseline: number } | null;
  load: { acute: number; usual: number } | null; // 2-day load vs typical 2 days
};

export type Readiness = {
  score: number;
  band: ReadinessBand;
  factors: ReadinessFactor[];
};

const clamp = (x: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, x));

// HRV ratio today/baseline → 0–100. At baseline = 50; ≥1.3× = 100; ≤0.7× = 0.
export function hrvScore(now: number, baseline: number): number {
  if (baseline <= 0) return 50;
  return clamp(((now / baseline - 0.7) / 0.6) * 100, 0, 100);
}

// RHR delta (bpm) → 0–100. At baseline = 50; −8 = 100; +8 = 0.
export function rhrScore(deltaBpm: number): number {
  return clamp(50 - (deltaBpm / 8) * 50, 0, 100);
}

const WEIGHTS = { sleep: 0.45, hrv: 0.3, rhr: 0.25 };

// Skin temp: quiet until the night sits clearly outside the athlete's normal
// spread (at least 0.4°C — cycle-phase shifts live under that), then 5→15 pts.
function tempPenalty(dev: number, sd: number | null): number {
  const threshold = Math.max(0.4, sd != null ? 2 * sd : 0);
  if (dev <= threshold) return 0;
  return Math.round(clamp(5 + ((dev - threshold) / 0.6) * 10, 5, 15));
}

// Breathing: +1 breath/min over normal is noise; past that, 3→10 pts.
function respPenalty(delta: number): number {
  if (delta <= 1) return 0;
  return Math.round(clamp(3 + ((delta - 1) / 1.5) * 7, 3, 10));
}

// Load: the last two days vs a typical two days. Up to 1.3× is normal
// training; a 2.5× spike costs the full 12.
function loadPenalty(ratio: number): number {
  if (ratio <= 1.3) return 0;
  return Math.round(clamp(((ratio - 1.3) / 1.2) * 12, 0, 12));
}

// Modifiers can drag a great night down, but never by more than this.
const MAX_PENALTY = 25;

const fmtDur = (min: number) =>
  `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, "0")}m`;
const signed = (x: number, digits = 1) =>
  `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(digits)}`;

/// Score a day. Null when none of sleep / HRV / resting HR is available —
/// the modifiers alone can't say you're ready, only that something's off.
export function computeReadiness(i: ReadinessInputs): Readiness | null {
  const comps: { score: number; weight: number }[] = [];
  const factors: ReadinessFactor[] = [];

  if (i.sleepScore != null) {
    const s = Math.round(i.sleepScore);
    comps.push({ score: s, weight: WEIGHTS.sleep });
    factors.push({
      key: "sleep",
      score: s,
      status: s >= 70 ? "good" : s >= 45 ? "ok" : "drag",
      value: i.asleepMin != null ? fmtDur(i.asleepMin) : `${s}`,
      note: s >= 70 ? "solid night" : s >= 45 ? "a bit short" : "short or broken",
    });
  }
  if (i.hrv) {
    const s = Math.round(hrvScore(i.hrv.now, i.hrv.baseline));
    comps.push({ score: s, weight: WEIGHTS.hrv });
    factors.push({
      key: "hrv",
      score: s,
      status: s >= 55 ? "good" : s >= 35 ? "ok" : "drag",
      value: `${Math.round(i.hrv.now)} ms`,
      note: `usual ${Math.round(i.hrv.baseline)} ms`,
    });
  }
  if (i.rhr) {
    const s = Math.round(rhrScore(i.rhr.now - i.rhr.baseline));
    comps.push({ score: s, weight: WEIGHTS.rhr });
    factors.push({
      key: "rhr",
      score: s,
      status: s >= 50 ? "good" : s >= 30 ? "ok" : "drag",
      value: `${Math.round(i.rhr.now)} bpm`,
      note: `usual ${Math.round(i.rhr.baseline)} bpm`,
    });
  }
  if (!comps.length) return null;

  const wsum = comps.reduce((s, c) => s + c.weight, 0);
  const core = comps.reduce((s, c) => s + c.score * c.weight, 0) / wsum;

  let penalty = 0;
  if (i.temp) {
    const dev = i.temp.nightlyC - i.temp.baselineC;
    const p = tempPenalty(dev, i.temp.stddevC);
    penalty += p;
    factors.push({
      key: "temp",
      penalty: p,
      status: p > 0 ? "drag" : "good",
      value: `${signed(dev)}°C`,
      note: p > 0 ? "running warm" : "normal",
    });
  }
  if (i.resp) {
    const delta = i.resp.now - i.resp.baseline;
    const p = respPenalty(delta);
    penalty += p;
    factors.push({
      key: "resp",
      penalty: p,
      status: p > 0 ? "drag" : "good",
      value: `${i.resp.now.toFixed(1)} /min`,
      note: `usual ${i.resp.baseline.toFixed(1)}`,
    });
  }
  if (i.load && i.load.usual > 0) {
    const ratio = i.load.acute / i.load.usual;
    const p = loadPenalty(ratio);
    penalty += p;
    factors.push({
      key: "load",
      penalty: p,
      status: p > 0 ? "drag" : ratio < 0.5 ? "good" : "ok",
      value:
        i.load.acute === 0 ? "Rest" : `${ratio.toFixed(1)}×`,
      note:
        i.load.acute === 0
          ? "nothing logged in 2 days"
          : p > 0
            ? "heavier than usual"
            : ratio < 0.5
              ? "lighter than usual"
              : "your usual",
    });
  }

  const score = Math.round(clamp(core - Math.min(penalty, MAX_PENALTY), 0, 100));
  return { score, band: readinessBand(score), factors };
}

/// Training load for one session: minutes × effort (session-RPE). Sessions
/// logged without an RPE count as a 7; without a duration, as 50 minutes.
export function sessionLoad(w: {
  duration: number | null;
  startedAt: Date | null;
  endedAt: Date | null;
  rpe: number | null;
}): number {
  let min = w.duration;
  if (!min && w.startedAt && w.endedAt) {
    min = Math.round((w.endedAt.getTime() - w.startedAt.getTime()) / 60000);
  }
  if (!min || min <= 0 || min > 300) min = 50;
  return min * clamp(w.rpe ?? 7, 1, 10);
}
