import "server-only";
import { prisma } from "@/lib/db";
import { sleepQualityScore } from "@/lib/sleepScore";
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
// Exported so the recovery page can label last night's sleep with the same
// number the recovery blend uses, instead of re-deriving its own.
export { sleepQualityScore };

function sleepScore(night: SleepNight): number {
  return sleepQualityScore(night.asleepMin, night.deepMin, night.remMin);
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

// How stale the stored recovery snapshot can get before we re-pull from
// Google Health. Sleep/HRV/RHR only change once a day, but Fitbit often syncs
// last night's sleep mid-morning — well after the first app open — so we keep
// the window short enough that a second visit picks it up promptly.
const RECOVERY_STALE_MS = 30 * 60 * 1000; // 30 min

/// Refresh the recovery snapshot ONLY if it's stale (or never computed) and the
/// user actually has a connected health account. Cheap to call from any entry
/// point (home feed, sync, coach) — it short-circuits when fresh and is fully
/// non-throwing. This is what decouples sleep/recovery freshness from the
/// exercise-session cache so it updates on normal app use, not just the Health
/// page. Call it inside `after()` so it never blocks the response.
export async function maybeRefreshRecovery(userId: string): Promise<void> {
  try {
    const acct = await prisma.healthAccount.findUnique({
      where: { userId },
      select: { recoveryAt: true },
    });
    if (!acct) return; // not connected — nothing to pull
    if (
      acct.recoveryAt &&
      Date.now() - acct.recoveryAt.getTime() < RECOVERY_STALE_MS
    ) {
      return; // still fresh
    }
    await refreshRecovery(userId);
  } catch {
    // best-effort; never surface
  }
}

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
        toSleepMin: lastNight.toSleepMin,
        afterWakeMin: lastNight.afterWakeMin,
        // Per-stage segments for the hypnogram timeline (epoch ms).
        stages: lastNight.stages.map((s) => ({
          type: s.type,
          startMs: s.startMs,
          endMs: s.endMs,
        })),
      };
      // Local calendar date of the wake — identifies which night this is.
      data.sleepNightKey = new Date(
        lastNight.end.getTime() + lastNight.offsetSec * 1000,
      )
        .toISOString()
        .slice(0, 10);
    }
    // 30-night history for the weekly/monthly chart (one entry per local night,
    // longest sleep wins on the rare night with multiple sessions).
    if (sleep.length) {
      const hist = new Map<
        string,
        {
          date: string;
          asleepMin: number;
          inBedMin: number;
          deepMin: number;
          remMin: number;
          lightMin: number;
          awakeMin: number;
          startUtc: string;
          endUtc: string;
          offsetSec: number;
        }
      >();
      for (const n of sleep) {
        const date = new Date(n.end.getTime() + n.offsetSec * 1000)
          .toISOString()
          .slice(0, 10);
        const prev = hist.get(date);
        if (!prev || n.asleepMin > prev.asleepMin) {
          hist.set(date, {
            date,
            asleepMin: n.asleepMin,
            inBedMin: n.inBedMin,
            deepMin: n.deepMin,
            remMin: n.remMin,
            lightMin: n.lightMin,
            awakeMin: n.awakeMin,
            startUtc: n.start.toISOString(),
            endUtc: n.end.toISOString(),
            offsetSec: n.offsetSec,
          });
        }
      }
      data.sleepHistory = [...hist.values()].sort((a, b) =>
        a.date.localeCompare(b.date),
      );
    }
    if (recoveryScore !== null) {
      data.recoveryScore = recoveryScore;
      data.recoveryBand = band;
      data.recoveryAt = now;
    }

    if (Object.keys(data).length > 0) {
      await prisma.healthAccount.update({ where: { userId }, data });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    const tz = user?.timezone ?? "UTC";
    const localKey = (dt: Date) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(dt);
    const todayKey = localKey(now);

    // Backfill prior days so the trend has depth immediately — compute a score
    // per day from the same 30-day series we just fetched, using a rolling
    // baseline (each day vs the days before it). Today is written from the
    // headline score below, so we skip it here.
    const dayKey = (dt: Date) => dt.toISOString().slice(0, 10);
    const rhrByKey = new Map<string, number>();
    for (const s of rhr) rhrByKey.set(dayKey(s.date), s.bpm);
    const hrvByKey = new Map<string, number>();
    for (const s of hrv) hrvByKey.set(dayKey(s.date), s.rmssd);
    const sleepByKey = new Map<string, SleepNight>();
    for (const n of sleep) {
      const k = dayKey(new Date(n.end.getTime() + n.offsetSec * 1000));
      const prev = sleepByKey.get(k);
      if (!prev || n.asleepMin > prev.asleepMin) sleepByKey.set(k, n);
    }
    const rhrSeries = [...rhrByKey.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
    const hrvSeries = [...hrvByKey.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
    const baselineBefore = (series: [string, number][], k: string) => {
      const prior = series.filter(([key]) => key < k).map(([, v]) => v);
      return prior.length
        ? prior.reduce((s, v) => s + v, 0) / prior.length
        : null;
    };

    const cutoff = dayKey(new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000));
    const candidateKeys = [
      ...new Set([
        ...rhrByKey.keys(),
        ...hrvByKey.keys(),
        ...sleepByKey.keys(),
      ]),
    ]
      .filter((k) => k >= cutoff && k !== todayKey)
      .sort();

    for (const k of candidateKeys) {
      const rhrV = rhrByKey.get(k) ?? null;
      const hrvV = hrvByKey.get(k) ?? null;
      const night = sleepByKey.get(k) ?? null;
      const rhrB = baselineBefore(rhrSeries, k);
      const hrvB = baselineBefore(hrvSeries, k);
      const dc: { score: number; weight: number }[] = [];
      if (night) dc.push({ score: sleepScore(night), weight: 0.45 });
      if (hrvV !== null && hrvB !== null)
        dc.push({ score: hrvScore(hrvV, hrvB), weight: 0.3 });
      if (rhrV !== null && rhrB !== null)
        dc.push({ score: rhrScore(rhrV - rhrB), weight: 0.25 });
      if (!dc.length) continue;
      const ws = dc.reduce((s, c) => s + c.weight, 0);
      const sc = Math.round(
        dc.reduce((s, c) => s + c.score * c.weight, 0) / ws,
      );
      const dd = {
        score: sc,
        band: recoveryBand(sc),
        sleepMin: night?.asleepMin ?? null,
        hrvMs: hrvV !== null ? round1(hrvV) : null,
        restingHr: rhrV,
      };
      await prisma.recoveryDay.upsert({
        where: { userId_dateKey: { userId, dateKey: k } },
        create: { userId, dateKey: k, ...dd },
        update: dd,
      });
    }

    // Today's row from the exact headline score (overrides any approximation).
    if (recoveryScore !== null) {
      const dayData = {
        score: recoveryScore,
        band,
        sleepMin: lastNight?.asleepMin ?? null,
        hrvMs: hrvNow !== null ? round1(hrvNow) : null,
        restingHr: rhrNow,
      };
      await prisma.recoveryDay.upsert({
        where: { userId_dateKey: { userId, dateKey: todayKey } },
        create: { userId, dateKey: todayKey, ...dayData },
        update: dayData,
      });
    }
  } catch {
    // Best-effort; never surface errors to the caller.
  }
}
