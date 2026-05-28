import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { listHeartRateBetween } from "@/lib/googleHealth";
import HeartRateView from "@/components/HeartRateView";

export const dynamic = "force-dynamic";

export default async function HeartRatePage() {
  const userId = await requireAuth();
  const account = await prisma.healthAccount.findUnique({ where: { userId } });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const tz = user?.timezone ?? "UTC";
  const dateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  // Compute today's [start, now) in the user's tz and pull samples server-side
  // so the initial paint isn't blank.
  let initialSamples: { t: string; bpm: number }[] = [];
  if (account) {
    const [y, m, d] = dateKey.split("-").map(Number);
    const offsetMin = tzOffsetMinutes(tz, new Date(Date.UTC(y, m - 1, d)));
    const startUtc = new Date(Date.UTC(y, m - 1, d) - offsetMin * 60 * 1000);
    const endUtc = new Date();
    try {
      const samples = await listHeartRateBetween(
        userId,
        startUtc.toISOString(),
        endUtc.toISOString(),
      );
      initialSamples = samples.map((s) => ({
        t: s.timestamp.toISOString(),
        bpm: s.bpm,
      }));
    } catch {
      // Fall through with empty samples; chart shows "no samples yet today".
    }
  }

  // All workouts with HR data in the last year — filtered client-side by
  // the active range chip (D / W / M / Y). One query covers all four views.
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const recentWorkouts = await prisma.workout.findMany({
    where: {
      userId,
      date: { gte: yearAgo },
      OR: [{ avgHeartRate: { not: null } }, { maxHeartRate: { not: null } }],
    },
    orderBy: { date: "desc" },
    select: {
      id: true,
      title: true,
      date: true,
      startedAt: true,
      endedAt: true,
      avgHeartRate: true,
      maxHeartRate: true,
    },
  });

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-24">
      <div className="flex items-center gap-3 mb-5">
        <Link
          href="/"
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--fg-muted)",
          }}
          aria-label="Back to feed"
        >
          ←
        </Link>
        <h1 className="text-[22px] font-bold tracking-tight">Heart rate</h1>
      </div>

      <HeartRateView
        initial={{
          connected: !!account,
          samples: initialSamples,
          tz,
          dateKey,
        }}
        workouts={recentWorkouts.map((w) => ({
          id: w.id,
          title: w.title,
          date: w.date.toISOString(),
          startedAt: w.startedAt ? w.startedAt.toISOString() : null,
          endedAt: w.endedAt ? w.endedAt.toISOString() : null,
          avgHeartRate: w.avgHeartRate,
          maxHeartRate: w.maxHeartRate,
        }))}
      />
    </div>
  );
}

function tzOffsetMinutes(tz: string, atUtc: Date): number {
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
