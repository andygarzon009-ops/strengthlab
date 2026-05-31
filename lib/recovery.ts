import "server-only";
import { prisma } from "@/lib/db";
import {
  listRestingHeartRate,
  listDailyHrv,
  listSleep,
  type SleepNight,
} from "@/lib/googleHealth";

export type RecoveryBand = "low" | "moderate" | "primed";

export function recoveryBand(score: number): RecoveryBand {
  if (score >= 67) return "primed";
  if (score >= 34) return "moderate";
  return "low";
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

// HRV ratio today/baseline → 0–100. 1.0 (at baseline) = 50; ≥1.3 = 100; ≤0.7 = 0.
// Higher HRV than your norm = better recovery.
function hrvScore(today: number, baseline: number): number {
  if (baseline <= 0) return 50;
  const ratio = today / baseline;
  return clamp(((ratio - 0.7) / 0.6) * 100, 0, 100);
}

// RHR delta (today − baseline, bpm) → 0–100. 0 = 50; −8 or lower = 100;
// +8 or higher = 0. Elevated resting HR = worse recovery.
function rhrScore(deltaBpm: number): number {
  return clamp(50 - (deltaBpm / 8) * 50, 0, 100);
}

// Sleep → 0–100: mostly duration, nudged by quality (deep+REM share).
// Duration: 3h(180m)=0 … 8h(480m)+=100. Quality: 20% deep+REM=0 … 50%+=100.
function sleepScore(night: SleepNight): number {
  const duration = clamp(((night.asleepMin - 180) / (480 - 180)) * 100, 0, 100);
  const denom = night.asleepMin || 1;
  const deepRemPct = ((night.deepMin + night.remMin) / denom) * 100;
  const quality = clamp(((deepRemPct - 20) / (50 - 20)) * 100, 0, 100);
  return 0.65 * duration + 0.35 * quality;
}

// Average of all-but-the-latest reading — "your normal", excluding today.
function baselineExcludingLast(values: number[]): number | null {
  if (values.length < 2) return null;
  const prior = values.slice(0, -1);
  return prior.reduce((s, v) => s + v, 0) / prior.length;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export type RecoverySnapshot = {
  recoveryScore: number | null;
  recoveryBand: RecoveryBand | null;
  restingHr: number | null;
  restingBaselineHr: number | null;
  restingDelta: number | null;
  hrvMs: number | null;
  hrvBaselineMs: number | null;
};

/// Pull HRV + resting HR from Google Health, compute the recovery score, and
/// persist the snapshot on the user's HealthAccount. Runs on sync / post-
/// response (never on the feed render path). Fully non-throwing, and only
/// writes values it actually has — an empty sync never clobbers last-known.
export async function refreshRecovery(userId: string): Promise<void> {
  try {
    const now = new Date();
    const sinceISO = new Date(
      now.getTime() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const nowISO = now.toISOString();

    const [rhr, hrv, sleep] = await Promise.all([
      listRestingHeartRate(userId, sinceISO, nowISO).catch(() => []),
      listDailyHrv(userId, sinceISO, nowISO).catch(() => []),
      listSleep(userId, sinceISO, nowISO).catch(() => []),
    ]);

    const rhrNow = rhr.length ? rhr[rhr.length - 1].bpm : null;
    const rhrBaseline = baselineExcludingLast(rhr.map((s) => s.bpm));
    const hrvNow = hrv.length ? hrv[hrv.length - 1].rmssd : null;
    const hrvBaseline = baselineExcludingLast(hrv.map((s) => s.rmssd));
    const lastNight: SleepNight | null = sleep.length ? sleep[0] : null;

    // Weighted blend of whatever signals are present. Sleep is the heaviest
    // when available; missing components renormalize the rest (so HRV+RHR only
    // collapses back to the Phase-1 0.55/0.45 split).
    const comps: { score: number; weight: number }[] = [];
    if (lastNight) comps.push({ score: sleepScore(lastNight), weight: 0.45 });
    if (hrvNow !== null && hrvBaseline !== null)
      comps.push({ score: hrvScore(hrvNow, hrvBaseline), weight: 0.3 });
    if (rhrNow !== null && rhrBaseline !== null)
      comps.push({ score: rhrScore(rhrNow - rhrBaseline), weight: 0.25 });

    let recoveryScore: number | null = null;
    let band: RecoveryBand | null = null;
    if (comps.length) {
      const wsum = comps.reduce((s, c) => s + c.weight, 0);
      recoveryScore = Math.round(
        comps.reduce((s, c) => s + c.score * c.weight, 0) / wsum,
      );
      band = recoveryBand(recoveryScore);
    }

    const data: Record<string, unknown> = {};
    if (rhrNow !== null) {
      data.restingHr = rhrNow;
      data.restingSource = "fitbit";
      data.restingHrAt = now;
      if (rhrBaseline !== null) {
        const base = Math.round(rhrBaseline);
        data.restingBaselineHr = base;
        data.restingDelta = rhrNow - base;
      }
    }
    if (hrvNow !== null) {
      data.hrvMs = round1(hrvNow);
      if (hrvBaseline !== null) data.hrvBaselineMs = round1(hrvBaseline);
    }
    if (lastNight) {
      data.sleepSummary = {
        asleepMin: lastNight.asleepMin,
        inBedMin: lastNight.inBedMin,
        deepMin: lastNight.deepMin,
        remMin: lastNight.remMin,
        lightMin: lastNight.lightMin,
        awakeMin: lastNight.awakeMin,
        startUtc: lastNight.start.toISOString(),
        endUtc: lastNight.end.toISOString(),
        offsetSec: lastNight.offsetSec,
      };
      // Local calendar date of the wake — identifies which night this is.
      data.sleepNightKey = new Date(
        lastNight.end.getTime() + lastNight.offsetSec * 1000,
      )
        .toISOString()
        .slice(0, 10);
    }
    if (recoveryScore !== null) {
      data.recoveryScore = recoveryScore;
      data.recoveryBand = band;
      data.recoveryAt = now;
    }

    if (Object.keys(data).length > 0) {
      await prisma.healthAccount.update({ where: { userId }, data });
    }
  } catch {
    // Best-effort; never surface errors to the caller.
  }
}
