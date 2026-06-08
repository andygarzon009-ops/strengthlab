import { NextRequest } from "next/server";
import { unstable_cache } from "next/cache";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import {
  HealthReauthRequiredError,
  listHeartRateBetween,
} from "@/lib/googleHealth";

export const maxDuration = 30;

type DaySample = { t: string; bpm: number };

/// Cache the (slow) Google Health pull per user+day for 2 minutes, so
/// reopening the page returns instantly instead of re-fetching every time.
/// The key is [userId, dateKey, startISO] — stable for the day — so within the
/// window every request hits the cache. `end` is computed inside at run time.
const getCachedDailySamples = unstable_cache(
  async (
    userId: string,
    _dateKey: string,
    startISO: string,
  ): Promise<DaySample[]> => {
    const startUtc = new Date(startISO);
    const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
    const realEnd = endUtc.getTime() > Date.now() ? new Date() : endUtc;
    const samples = await listHeartRateBetween(
      userId,
      startUtc.toISOString(),
      realEnd.toISOString(),
    );
    return samples.map((s) => ({ t: s.timestamp.toISOString(), bpm: s.bpm }));
  },
  ["daily-hr-v1"],
  { revalidate: 120 },
);

/// Returns all heart-rate samples for a single calendar day in the user's
/// timezone, pulled from Google Health. Used by the /heart-rate page to
/// render the all-day bucketed range chart.
export async function GET(req: NextRequest) {
  const userId = await requireAuth();
  const account = await prisma.healthAccount.findUnique({ where: { userId } });
  if (!account) return Response.json({ connected: false });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const tz = user?.timezone ?? "UTC";

  const url = new URL(req.url);
  // dateKey is a YYYY-MM-DD string in the user's tz. Defaults to today.
  const dateKey =
    url.searchParams.get("date") ??
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

  // Build a [start, end) window covering the calendar day in `tz`.
  // We construct ISO strings by feeding the tz-local midnight back through
  // Date — works because Intl gives us the right Y-M-D in tz and we then
  // bracket with 24h.
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) {
    return Response.json({ error: "Invalid date" }, { status: 400 });
  }
  // Approximation: assume the user's tz offset is stable on that date.
  // We compute the local midnight by formatting an arbitrary UTC instant
  // shifted by the offset implied by Intl.DateTimeFormat parts.
  const offsetMin = tzOffsetMinutes(tz, new Date(Date.UTC(y, m - 1, d)));
  const startUtc = new Date(Date.UTC(y, m - 1, d) - offsetMin * 60 * 1000);

  try {
    const samples = await getCachedDailySamples(
      userId,
      dateKey,
      startUtc.toISOString(),
    );
    return Response.json({ connected: true, dateKey, tz, samples });
  } catch (e) {
    if (e instanceof HealthReauthRequiredError) {
      return Response.json({ connected: true, needsReconnect: true, dateKey, tz, samples: [] });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 502 });
  }
}

function tzOffsetMinutes(tz: string, atUtc: Date): number {
  // Read the wall-clock fields the tz would show for atUtc, reconstruct
  // that time as if it were UTC, and diff. Gives signed offset in minutes
  // (e.g. -300 for EST, +540 for JST).
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(atUtc);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") === 24 ? 0 : get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - atUtc.getTime()) / 60000);
}
