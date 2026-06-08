import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import HeartRateView from "@/components/HeartRateView";
import HealthReconnectBanner from "@/components/HealthReconnectBanner";
import BackButton from "@/components/BackButton";

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

  // Samples are now fetched client-side by DailyHRChart (/api/health/daily-hr),
  // so the page never blocks on a slow Google Health call. The chart shows its
  // own loading state and fills in once the fetch returns.
  const initialSamples: { t: string; bpm: number }[] = [];

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
        <BackButton href="/" ariaLabel="Back to feed" />
        <h1 className="text-[22px] font-bold tracking-tight">Heart rate</h1>
      </div>

      <HealthReconnectBanner />

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
