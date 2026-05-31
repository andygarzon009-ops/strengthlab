import "server-only";
import { prisma } from "@/lib/db";
import { listRestingHeartRate, listDailyHrv } from "@/lib/googleHealth";

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

    const [rhr, hrv] = await Promise.all([
      listRestingHeartRate(userId, sinceISO, nowISO).catch(() => []),
      listDailyHrv(userId, sinceISO, nowISO).catch(() => []),
    ]);

    const rhrNow = rhr.length ? rhr[rhr.length - 1].bpm : null;
    const rhrBaseline = baselineExcludingLast(rhr.map((s) => s.bpm));
    const hrvNow = hrv.length ? hrv[hrv.length - 1].rmssd : null;
    const hrvBaseline = baselineExcludingLast(hrv.map((s) => s.rmssd));

    // Weighted blend of whatever signals are present.
    const comps: { score: number; weight: number }[] = [];
    if (hrvNow !== null && hrvBaseline !== null)
      comps.push({ score: hrvScore(hrvNow, hrvBaseline), weight: 0.55 });
    if (rhrNow !== null && rhrBaseline !== null)
      comps.push({ score: rhrScore(rhrNow - rhrBaseline), weight: 0.45 });

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
