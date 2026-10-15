import "server-only";
import { prisma } from "@/lib/db";
import { sleepQualityScore } from "@/lib/sleepScore";
import {
  listRestingHeartRate,
  listDailyHrv,
  listSleep,
  listDailyRespiratoryRate,
  listDailySkinTemperature,
  type SleepNight,
  type DailyRespiratorySample,
  type DailySkinTempSample,
} from "@/lib/googleHealth";
import {
  computeReadiness,
  readinessBand,
  sessionLoad,
  type ReadinessBand,
  type ReadinessInputs,
} from "@/lib/readiness";

// The stored score is readiness now (lib/readiness.ts); these names stay so
// the columns and every reader of them keep working.
export type RecoveryBand = ReadinessBand;
export const recoveryBand = readinessBand;

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

    const DAY = 24 * 60 * 60 * 1000;
    const [rhr, hrv, sleep, resp, temp, user, workouts] = await Promise.all([
      listRestingHeartRate(userId, sinceISO, nowISO).catch(() => []),
      listDailyHrv(userId, sinceISO, nowISO).catch(() => []),
      listSleep(userId, sinceISO, nowISO).catch(() => []),
      listDailyRespiratoryRate(userId).catch(() => []),
      listDailySkinTemperature(userId).catch(() => []),
      prisma.user.findUnique({
        where: { id: userId },
        select: { timezone: true },
      }),
      prisma.workout.findMany({
        where: { userId, date: { gte: new Date(now.getTime() - 45 * DAY) } },
        select: {
          date: true,
          duration: true,
          startedAt: true,
          endedAt: true,
          rpe: true,
        },
      }),
    ]);

    // One line per sync so it's visible whether the newer Google Health
    // types (breathing, skin temp) are coming back for this account.
    console.log(
      `[readiness] user=${userId} sleep=${sleep.length} hrv=${hrv.length} rhr=${rhr.length} resp=${resp.length} temp=${temp.length} workouts=${workouts.length}`,
    );

    const tz = user?.timezone ?? "UTC";
    const localKey = (dt: Date) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(dt);
    const todayKey = localKey(now);
    const shiftKey = (k: string, days: number) =>
      new Date(Date.parse(`${k}T12:00:00Z`) + days * DAY)
        .toISOString()
        .slice(0, 10);

    // Training load per local day, from what was logged here.
    const loadByDay = new Map<string, number>();
    for (const w of workouts) {
      const k = localKey(w.date);
      loadByDay.set(k, (loadByDay.get(k) ?? 0) + sessionLoad(w));
    }
    const sessionsBetween = (from: string, to: string) =>
      workouts.filter((w) => {
        const k = localKey(w.date);
        return k >= from && k < to;
      }).length;
    // The two days before `k` vs a typical two days over the 28 before that.
    // Needs a few sessions of history, or there's no "usual" to compare to.
    const loadFor = (k: string): ReadinessInputs["load"] => {
      const from = shiftKey(k, -30);
      const to = shiftKey(k, -2);
      if (sessionsBetween(from, to) < 4) return null;
      let chronic = 0;
      for (const [day, l] of loadByDay) if (day >= from && day < to) chronic += l;
      const acute =
        (loadByDay.get(shiftKey(k, -1)) ?? 0) +
        (loadByDay.get(shiftKey(k, -2)) ?? 0);
      return { acute, usual: (chronic / 28) * 2 };
    };
    // Breathing vs the mean of up to 30 earlier nights (at least 5).
    const respFor = (k: string): ReadinessInputs["resp"] => {
      const cur = resp.find((r: DailyRespiratorySample) => r.dateKey === k);
      const prior = resp.filter((r) => r.dateKey < k).slice(-30);
      if (!cur || prior.length < 5) return null;
      return {
        now: cur.bpm,
        baseline: prior.reduce((s, r) => s + r.bpm, 0) / prior.length,
      };
    };
    const tempFor = (k: string): ReadinessInputs["temp"] => {
      const cur = temp.find((t: DailySkinTempSample) => t.dateKey === k);
      if (!cur || cur.baselineC == null) return null;
      return {
        nightlyC: cur.nightlyC,
        baselineC: cur.baselineC,
        stddevC: cur.stddevC,
      };
    };

    const rhrNow = rhr.length ? rhr[rhr.length - 1].bpm : null;
    const rhrBaseline = baselineExcludingLast(rhr.map((s) => s.bpm));
    const hrvNow = hrv.length ? hrv[hrv.length - 1].rmssd : null;
    const hrvBaseline = baselineExcludingLast(hrv.map((s) => s.rmssd));
    const lastNight: SleepNight | null = sleep.length ? sleep[0] : null;

    // Temperature and breathing only count when they're from last night (or
    // the night before, if Fitbit hasn't posted today's yet) — a week-old
    // fever reading says nothing about today.
    const latestKeyOf = (xs: { dateKey: string }[]) =>
      xs.length && xs[xs.length - 1].dateKey >= shiftKey(todayKey, -1)
        ? xs[xs.length - 1].dateKey
        : null;
    const respKey = latestKeyOf(resp);
    const tempKey = latestKeyOf(temp);
    const readiness = computeReadiness({
      sleepScore: lastNight ? sleepScore(lastNight) : null,
      asleepMin: lastNight?.asleepMin ?? null,
      hrv:
        hrvNow !== null && hrvBaseline !== null
          ? { now: hrvNow, baseline: hrvBaseline }
          : null,
      rhr:
        rhrNow !== null && rhrBaseline !== null
          ? { now: rhrNow, baseline: rhrBaseline }
          : null,
      temp: tempKey ? tempFor(tempKey) : null,
      resp: respKey ? respFor(respKey) : null,
      load: loadFor(todayKey),
    });
    const recoveryScore = readiness?.score ?? null;
    const band = readiness?.band ?? null;

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
          toSleepMin: number;
          stages: { type: string; startMs: number; endMs: number }[];
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
            toSleepMin: n.toSleepMin,
            stages: n.stages.map((s) => ({
              type: s.type,
              startMs: s.startMs,
              endMs: s.endMs,
            })),
          });
        }
      }
      const ordered = [...hist.values()].sort((a, b) =>
        a.date.localeCompare(b.date),
      );
      // Per-stage segments are big (hundreds of rows a night) and only the
      // 7-day trend can surface them, so keep them on the newest 7 nights and
      // strip them from the older ones the month chart reads.
      const withStages = ordered.length - 7;
      data.sleepHistory = ordered.map((n, i) =>
        i < withStages ? { ...n, stages: [] } : n,
      );
    }
    if (recoveryScore !== null) {
      data.recoveryScore = recoveryScore;
      data.recoveryBand = band;
      data.recoveryAt = now;
      data.readinessFactors = readiness!.factors;
    }

    if (Object.keys(data).length > 0) {
      await prisma.healthAccount.update({ where: { userId }, data });
    }

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
      const day = computeReadiness({
        sleepScore: night ? sleepScore(night) : null,
        asleepMin: night?.asleepMin ?? null,
        hrv: hrvV !== null && hrvB !== null ? { now: hrvV, baseline: hrvB } : null,
        rhr: rhrV !== null && rhrB !== null ? { now: rhrV, baseline: rhrB } : null,
        temp: tempFor(k),
        resp: respFor(k),
        load: loadFor(k),
      });
      if (!day) continue;
      const dd = {
        score: day.score,
        band: day.band,
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
