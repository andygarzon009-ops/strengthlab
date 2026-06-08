import "server-only";
import { prisma } from "@/lib/db";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const HEALTH_API_BASE = "https://health.googleapis.com/v4";

// activity_and_fitness covers exercise sessions; heart_rate is a separate
// scope required to read per-second heart-rate data points. Adding scopes
// here invalidates the consent of previously connected users — they must
// disconnect and reconnect to grant the new scope.
export const HEALTH_SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  // Sleep (recovery Phase 2). Restricted scope — fine for Testing-mode test
  // users without full verification. Existing users must reconnect to grant it.
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
];

/// Thrown when Google rejects the stored refresh token (400 invalid_grant) —
/// the only fix is for the user to re-run the OAuth consent flow. Because our
/// consent screen is in "Testing" publishing status, Google expires refresh
/// tokens 7 days after consent, so this recurs roughly weekly until the app is
/// verified/published. Callers translate this into a "reconnect" prompt rather
/// than a generic error.
export class HealthReauthRequiredError extends Error {
  constructor() {
    super("Health re-authentication required");
    this.name = "HealthReauthRequiredError";
  }
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

// These calls run during the feed render. Without a timeout, a slow/unreachable
// Google endpoint hangs the whole page. Abort after 6s so the surrounding
// <Suspense> can fall back / the card can render its disconnected state.
const HEALTH_FETCH_TIMEOUT_MS = 6000;

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = HEALTH_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("GOOGLE_HEALTH_CLIENT_ID"),
    redirect_uri: requireEnv("GOOGLE_HEALTH_REDIRECT_URI"),
    response_type: "code",
    access_type: "offline",
    // prompt=consent guarantees a refresh_token even on reconnects
    prompt: "consent",
    scope: HEALTH_SCOPES.join(" "),
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: requireEnv("GOOGLE_HEALTH_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_HEALTH_CLIENT_SECRET"),
    redirect_uri: requireEnv("GOOGLE_HEALTH_REDIRECT_URI"),
    grant_type: "authorization_code",
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as TokenResponse;
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: requireEnv("GOOGLE_HEALTH_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_HEALTH_CLIENT_SECRET"),
    grant_type: "refresh_token",
  });
  const res = await fetchWithTimeout(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    // invalid_grant means the refresh token is dead (expired under Testing-mode
    // 7-day limit, or revoked by the user). Surface it as a typed error so the
    // UI can prompt a reconnect instead of showing a meaningless 502.
    if (res.status === 400 && text.includes("invalid_grant")) {
      throw new HealthReauthRequiredError();
    }
    throw new Error(`Refresh failed: ${res.status} ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

/// Returns a valid access token, refreshing first if the stored one has < 60s left.
/// Persists the refreshed token so the next call doesn't have to.
async function getValidAccessToken(userId: string): Promise<string> {
  const account = await prisma.healthAccount.findUnique({ where: { userId } });
  if (!account) throw new Error("Health account not connected");

  // 60s safety margin — avoid using a token that's about to expire mid-request
  if (account.expiresAt.getTime() - Date.now() > 60_000) {
    return account.accessToken;
  }

  const refreshed = await refreshAccessToken(account.refreshToken);
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
  await prisma.healthAccount.update({
    where: { userId },
    data: {
      accessToken: refreshed.access_token,
      // Google does not always return a new refresh_token on refresh; keep old when absent
      refreshToken: refreshed.refresh_token ?? account.refreshToken,
      expiresAt,
      scope: refreshed.scope,
    },
  });
  return refreshed.access_token;
}

/// Lightweight auth probe for the reconnect banner. Reports whether the user
/// has a connected Health account and, if so, whether the stored token still
/// works (needsReconnect === true → the refresh token is dead and they must
/// re-consent). Refreshing succeeds as a side effect when the token is merely
/// stale, so a healthy account returns fast. Transient network failures are
/// treated as "still connected" so a blip doesn't nag the user to reconnect.
export async function checkHealthAuth(
  userId: string,
): Promise<{ connected: boolean; needsReconnect: boolean }> {
  const account = await prisma.healthAccount.findUnique({ where: { userId } });
  if (!account) return { connected: false, needsReconnect: false };
  try {
    await getValidAccessToken(userId);
    return { connected: true, needsReconnect: false };
  } catch (e) {
    return { connected: true, needsReconnect: e instanceof HealthReauthRequiredError };
  }
}

async function healthFetch(userId: string, path: string): Promise<unknown> {
  const token = await getValidAccessToken(userId);
  const res = await fetchWithTimeout(`${HEALTH_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Health API ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export type ExercisePoint = {
  name: string;
  exercise: {
    interval: { startTime: string; endTime: string };
    exerciseType?: string;
    displayName?: string;
    activeDuration?: string;
    metricsSummary?: {
      caloriesKcal?: number;
      distanceMillimiters?: number;
      steps?: string;
      averageHeartRateBeatsPerMinute?: string;
      activeZoneMinutes?: string | number;
    };
  };
};

export async function listExercise(
  userId: string,
  sinceISO?: string,
): Promise<ExercisePoint[]> {
  let path = "/users/me/dataTypes/exercise/dataPoints";
  if (sinceISO) {
    const filter = `exercise.interval.civil_start_time >= "${sinceISO}"`;
    path += `?filter=${encodeURIComponent(filter)}`;
  }
  const data = (await healthFetch(userId, path)) as { dataPoints?: ExercisePoint[] };
  return data.dataPoints ?? [];
}

export type HeartRateSample = {
  timestamp: Date;
  bpm: number;
};

/// Heart-rate data points covered by the activity_and_fitness scope.
/// The Health API returns one point per Fitbit reading (every few seconds when
/// the device is actively tracking, less frequent otherwise).
type HeartRateRawPoint = {
  heartRate?: {
    sampleTime?: { physicalTime?: string };
    // Returned as a string-encoded int64 per Google's API conventions.
    beatsPerMinute?: string | number;
  };
};

export type RestingHeartRateSample = {
  date: Date;
  bpm: number;
};

/// Daily resting heart-rate from Google Health. The correct data type is
/// `daily-resting-heart-rate` (the older `resting-heart-rate` ID is rejected by
/// the API — that bug is why this used to always return empty). Each point is a
/// per-day value keyed by a civil date, with no sample_time filtering, so we
/// pull recent points and filter to [start, end) in code. A day can have
/// multiple sources (Fitbit + Apple HealthKit) — we keep one per day, preferring
/// the Fitbit sleep-based reading. Returns sorted oldest → newest, or [] if the
/// account has no data.
export async function listRestingHeartRate(
  userId: string,
  startISO: string,
  endISO: string,
): Promise<RestingHeartRateSample[]> {
  const path =
    "/users/me/dataTypes/daily-resting-heart-rate/dataPoints?pageSize=60";

  try {
    const data = (await healthFetch(userId, path)) as {
      dataPoints?: {
        dataSource?: { platform?: string };
        dailyRestingHeartRate?: {
          date?: { year: number; month: number; day: number };
          beatsPerMinute?: string | number;
          dailyRestingHeartRateMetadata?: { calculationMethod?: string };
        };
      }[];
    };

    const start = new Date(startISO).getTime();
    const end = new Date(endISO).getTime();
    // Keep the best reading per calendar day (Fitbit sleep-based wins).
    const byDay = new Map<string, { date: Date; bpm: number; score: number }>();
    for (const p of data.dataPoints ?? []) {
      const d = p.dailyRestingHeartRate?.date;
      const raw = p.dailyRestingHeartRate?.beatsPerMinute;
      const bpm = typeof raw === "string" ? Number(raw) : raw;
      if (!d || typeof bpm !== "number" || !Number.isFinite(bpm) || bpm <= 0)
        continue;
      const date = new Date(Date.UTC(d.year, d.month - 1, d.day));
      const t = date.getTime();
      if (t < start || t >= end) continue;
      const platform = p.dataSource?.platform;
      const method =
        p.dailyRestingHeartRate?.dailyRestingHeartRateMetadata?.calculationMethod;
      const score =
        (platform === "FITBIT" ? 2 : 0) + (method === "WITH_SLEEP" ? 1 : 0);
      const key = `${d.year}-${d.month}-${d.day}`;
      const prev = byDay.get(key);
      if (!prev || score > prev.score)
        byDay.set(key, { date, bpm: Math.round(bpm), score });
    }

    return [...byDay.values()]
      .map(({ date, bpm }) => ({ date, bpm }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  } catch {
    // Account/device doesn't expose this data type — degrade silently.
    return [];
  }
}

export type DailyHrvSample = {
  date: Date; // calendar day (UTC midnight key)
  rmssd: number; // avg RMSSD in ms for that night
};

/// Per-night heart-rate variability (RMSSD, ms) from Google Health. Available
/// under the activity_and_fitness scope (no extra consent). Fitbit emits many
/// readings overnight; we average the valid (>0) ones per calendar day. Needs
/// the device worn to sleep, so nights without wear are simply absent. Sorted
/// oldest → newest; [] if unavailable.
export async function listDailyHrv(
  userId: string,
  startISO: string,
  endISO: string,
): Promise<DailyHrvSample[]> {
  const toUtc = (s: string) => (s.endsWith("Z") ? s : `${s}Z`);
  const filter =
    `heart_rate_variability.sample_time.physical_time >= "${toUtc(startISO)}"` +
    ` AND heart_rate_variability.sample_time.physical_time < "${toUtc(endISO)}"`;
  const path =
    "/users/me/dataTypes/heart-rate-variability/dataPoints?pageSize=500&filter=" +
    encodeURIComponent(filter);

  try {
    const data = (await healthFetch(userId, path)) as {
      dataPoints?: {
        heartRateVariability?: {
          sampleTime?: { physicalTime?: string };
          rootMeanSquareOfSuccessiveDifferencesMilliseconds?: number;
        };
      }[];
    };

    const byDay = new Map<string, { sum: number; n: number; date: Date }>();
    for (const p of data.dataPoints ?? []) {
      const ts = p.heartRateVariability?.sampleTime?.physicalTime;
      const rmssd =
        p.heartRateVariability?.rootMeanSquareOfSuccessiveDifferencesMilliseconds;
      if (!ts || typeof rmssd !== "number" || !Number.isFinite(rmssd) || rmssd <= 0)
        continue;
      const dt = new Date(ts);
      const key = dt.toISOString().slice(0, 10);
      const cur = byDay.get(key);
      if (cur) {
        cur.sum += rmssd;
        cur.n += 1;
      } else {
        byDay.set(key, {
          sum: rmssd,
          n: 1,
          date: new Date(`${key}T00:00:00Z`),
        });
      }
    }

    return [...byDay.values()]
      .map(({ sum, n, date }) => ({ date, rmssd: sum / n }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  } catch {
    return [];
  }
}

export type SleepNight = {
  start: Date; // UTC bedtime
  end: Date; // UTC wake
  offsetSec: number; // local utc offset, e.g. -21600
  asleepMin: number;
  inBedMin: number;
  deepMin: number;
  remMin: number;
  lightMin: number;
  awakeMin: number;
};

/// Sleep sessions from Google Health (needs the sleep scope). Returns full
/// (non-nap) nights, newest first, within [start, end). Each Fitbit sleep
/// point carries a pre-computed `summary` with minutes asleep / in bed and a
/// per-stage breakdown, so we don't have to sum stages ourselves. Naps
/// (metadata.nap === true) are excluded. [] if unavailable / no scope.
export async function listSleep(
  userId: string,
  startISO: string,
  endISO: string,
): Promise<SleepNight[]> {
  const path = "/users/me/dataTypes/sleep/dataPoints?pageSize=30";
  try {
    const data = (await healthFetch(userId, path)) as {
      dataPoints?: {
        sleep?: {
          interval?: {
            startTime?: string;
            endTime?: string;
            startUtcOffset?: string;
          };
          metadata?: { nap?: boolean };
          summary?: {
            minutesAsleep?: string | number;
            minutesInSleepPeriod?: string | number;
            stagesSummary?: { type?: string; minutes?: string | number }[];
          };
        };
      }[];
    };

    const num = (x: unknown) => {
      const n = Number(x);
      return Number.isFinite(n) ? n : 0;
    };
    const startMs = Date.parse(startISO);
    const endMs = Date.parse(endISO);
    const out: SleepNight[] = [];
    for (const p of data.dataPoints ?? []) {
      const s = p.sleep;
      const sum = s?.summary;
      const iv = s?.interval;
      if (!sum || !iv?.startTime || !iv?.endTime) continue;
      if (s?.metadata?.nap === true) continue; // skip naps
      const start = new Date(iv.startTime);
      const end = new Date(iv.endTime);
      const t = end.getTime();
      if (t < startMs || t >= endMs) continue;

      const stages = { deep: 0, rem: 0, light: 0, awake: 0 };
      for (const st of sum.stagesSummary ?? []) {
        const m = num(st.minutes);
        if (st.type === "DEEP") stages.deep = m;
        else if (st.type === "REM") stages.rem = m;
        else if (st.type === "LIGHT") stages.light = m;
        else if (st.type === "AWAKE") stages.awake = m;
      }
      out.push({
        start,
        end,
        offsetSec: parseInt(iv.startUtcOffset ?? "0", 10) || 0,
        asleepMin: num(sum.minutesAsleep),
        inBedMin: num(sum.minutesInSleepPeriod),
        deepMin: stages.deep,
        remMin: stages.rem,
        lightMin: stages.light,
        awakeMin: stages.awake,
      });
    }
    out.sort((a, b) => b.end.getTime() - a.end.getTime());
    return out;
  } catch {
    return [];
  }
}

export type DailySpo2Sample = {
  date: Date; // UTC midnight of the night's calendar day
  avgPct: number; // mean overnight SpO2 % for that day
  minPct: number; // lowest single reading that day
};

/// Per-night blood-oxygen (SpO2, %) from Google Health. Data type
/// `oxygen-saturation` lives under the health_metrics_and_measurements scope
/// (already granted — no reconnect). Fitbit samples SpO2 across the night while
/// the tracker is worn; we keep the mean and the min per calendar day. A
/// resting average sits ~95–99%; sustained dips can flag illness or poor
/// recovery. Sorted oldest → newest; [] if unavailable / tracker not worn.
/// Field shape verified against the v4 discovery doc:
/// dataPoint.oxygenSaturation.{ sampleTime.physicalTime, percentage:number }.
export async function listOxygenSaturation(
  userId: string,
  startISO: string,
  endISO: string,
): Promise<DailySpo2Sample[]> {
  const toUtc = (s: string) => (s.endsWith("Z") ? s : `${s}Z`);
  const filter =
    `oxygen_saturation.sample_time.physical_time >= "${toUtc(startISO)}"` +
    ` AND oxygen_saturation.sample_time.physical_time < "${toUtc(endISO)}"`;
  const path =
    "/users/me/dataTypes/oxygen-saturation/dataPoints?pageSize=1000&filter=" +
    encodeURIComponent(filter);

  try {
    const data = (await healthFetch(userId, path)) as {
      dataPoints?: {
        oxygenSaturation?: {
          sampleTime?: { physicalTime?: string };
          percentage?: number;
        };
      }[];
    };

    const byDay = new Map<
      string,
      { sum: number; n: number; min: number; date: Date }
    >();
    for (const p of data.dataPoints ?? []) {
      const ts = p.oxygenSaturation?.sampleTime?.physicalTime;
      const pct = p.oxygenSaturation?.percentage;
      // Guard the physiological range — drops obviously bad readings.
      if (!ts || typeof pct !== "number" || !Number.isFinite(pct) || pct < 50 || pct > 100)
        continue;
      const key = new Date(ts).toISOString().slice(0, 10);
      const cur = byDay.get(key);
      if (cur) {
        cur.sum += pct;
        cur.n += 1;
        if (pct < cur.min) cur.min = pct;
      } else {
        byDay.set(key, {
          sum: pct,
          n: 1,
          min: pct,
          date: new Date(`${key}T00:00:00Z`),
        });
      }
    }

    return [...byDay.values()]
      .map(({ sum, n, min, date }) => ({ date, avgPct: sum / n, minPct: min }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  } catch {
    return [];
  }
}

export async function listHeartRateBetween(
  userId: string,
  startISO: string,
  endISO: string,
): Promise<HeartRateSample[]> {
  // Heart-rate is a sample-type data point (instantaneous reading), so the
  // filter uses sample_time.physical_time — not interval.start_time which only
  // applies to interval-type data points like exercise.
  const toUtc = (s: string) => (s.endsWith("Z") ? s : `${s}Z`);
  // Sample-type members only support >= and < (not <=).
  const filter =
    `heart_rate.sample_time.physical_time >= "${toUtc(startISO)}"` +
    ` AND heart_rate.sample_time.physical_time < "${toUtc(endISO)}"`;
  const basePath =
    "/users/me/dataTypes/heart-rate/dataPoints?pageSize=1000&filter=" +
    encodeURIComponent(filter);

  const samples: HeartRateSample[] = [];
  let pageToken: string | undefined;
  // The Health API caps each page well below a typical workout's sample
  // count (Fitbit emits one reading every ~5s during activity), so we
  // must page through nextPageToken until exhausted — otherwise long
  // workouts only render the first few minutes of HR data.
  do {
    const path: string = pageToken
      ? `${basePath}&pageToken=${encodeURIComponent(pageToken)}`
      : basePath;
    const data = (await healthFetch(userId, path)) as {
      dataPoints?: HeartRateRawPoint[];
      nextPageToken?: string;
    };
    for (const point of data.dataPoints ?? []) {
      const ts = point.heartRate?.sampleTime?.physicalTime;
      const raw = point.heartRate?.beatsPerMinute;
      const bpm = typeof raw === "string" ? Number(raw) : raw;
      if (!ts || typeof bpm !== "number" || !Number.isFinite(bpm) || bpm <= 0) continue;
      samples.push({ timestamp: new Date(ts), bpm: Math.round(bpm) });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  samples.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  return samples;
}

