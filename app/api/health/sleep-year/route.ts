import { unstable_cache } from "next/cache";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { listSleepSince } from "@/lib/googleHealth";

export const maxDuration = 30;

type YearNight = {
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
};

/// A year of nights is a dozen paged Google Health calls, so it's cached per
/// user for six hours — the year view barely moves day to day.
const getYear = unstable_cache(
  async (userId: string): Promise<YearNight[]> => {
    const now = new Date();
    const start = new Date(now.getTime() - 366 * 24 * 60 * 60 * 1000);
    const nights = await listSleepSince(userId, start.toISOString(), now.toISOString());
    // One night per local wake date — the longest, same rule as the 30-day history.
    const byDate = new Map<string, YearNight>();
    for (const n of nights) {
      const date = new Date(n.end.getTime() + n.offsetSec * 1000).toISOString().slice(0, 10);
      const prev = byDate.get(date);
      if (prev && prev.asleepMin >= n.asleepMin) continue;
      byDate.set(date, {
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
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  },
  ["sleep-year-v1"],
  { revalidate: 6 * 60 * 60 },
);

export async function GET() {
  const userId = await requireAuth();
  const account = await prisma.healthAccount.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!account) return Response.json({ nights: [] });
  try {
    return Response.json({ nights: await getYear(userId) });
  } catch (e) {
    console.error("[sleep-year]", e);
    return Response.json({ nights: [], error: "unavailable" }, { status: 502 });
  }
}
