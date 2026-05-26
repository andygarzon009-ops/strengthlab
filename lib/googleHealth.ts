import "server-only";
import { prisma } from "@/lib/db";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const HEALTH_API_BASE = "https://health.googleapis.com/v4";

// activity_and_fitness includes per-session heart rate metrics
// (averageHeartRateBeatsPerMinute on each exercise point). There's no
// standalone heart_rate scope in the Google Health API today.
export const HEALTH_SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
];

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
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
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Refresh failed: ${res.status} ${await res.text()}`);
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

async function healthFetch(userId: string, path: string): Promise<unknown> {
  const token = await getValidAccessToken(userId);
  const res = await fetch(`${HEALTH_API_BASE}${path}`, {
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
      activeZoneMinutes?: string;
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

