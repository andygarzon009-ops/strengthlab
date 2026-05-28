import { prisma } from "@/lib/db";
import { listRestingHeartRate } from "@/lib/googleHealth";

type Props = {
  userId: string;
};

function formatRelative(d: Date): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 7) return `${day}d ago`;
  const week = Math.floor(day / 7);
  return `${week}w ago`;
}

export default async function HeartRateCard({ userId }: Props) {
  const account = await prisma.healthAccount.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!account) return null;

  const lastWorkout = await prisma.workout.findFirst({
    where: {
      userId,
      OR: [{ avgHeartRate: { not: null } }, { maxHeartRate: { not: null } }],
    },
    orderBy: { date: "desc" },
    select: {
      id: true,
      title: true,
      date: true,
      avgHeartRate: true,
      maxHeartRate: true,
    },
  });

  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const samples = await listRestingHeartRate(
    userId,
    fourteenDaysAgo.toISOString(),
    now.toISOString(),
  );

  // Two-bucket compare: most recent reading vs the prior week's average.
  // Surfaces "you're trending down" without us having to chart anything.
  let restingNow: number | null = null;
  let restingDelta: number | null = null;
  if (samples.length > 0) {
    restingNow = samples[samples.length - 1].bpm;
    const cutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const prior = samples.filter((s) => s.date.getTime() < cutoff);
    if (prior.length > 0) {
      const priorAvg =
        prior.reduce((sum, s) => sum + s.bpm, 0) / prior.length;
      restingDelta = restingNow - Math.round(priorAvg);
    }
  }

  // Nothing useful to show — bail rather than rendering an empty card.
  if (!lastWorkout && restingNow === null) return null;

  const trendColor =
    restingDelta === null
      ? "var(--fg-dim)"
      : restingDelta < 0
        ? "var(--accent)"
        : restingDelta > 0
          ? "#f97316"
          : "var(--fg-dim)";
  const trendArrow =
    restingDelta === null ? "" : restingDelta < 0 ? "↓" : restingDelta > 0 ? "↑" : "·";

  return (
    <div
      className="rounded-2xl p-4 mb-3"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{
              background: "#ef4444",
              boxShadow: "0 0 6px rgba(239,68,68,0.5)",
            }}
          />
          <h3 className="text-[14px] font-bold tracking-tight">Heart rate</h3>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {lastWorkout && (
          <div className="space-y-1">
            <p
              className="text-[10px] uppercase tracking-wider font-semibold"
              style={{ color: "var(--fg-dim)" }}
            >
              Last session
            </p>
            <p className="text-[13px] font-medium truncate">
              {lastWorkout.title}
            </p>
            <p className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
              {formatRelative(lastWorkout.date)}
            </p>
            <div className="flex items-baseline gap-3 pt-1 tabular-nums">
              {lastWorkout.avgHeartRate && (
                <span>
                  <span className="text-[18px] font-bold">
                    {lastWorkout.avgHeartRate}
                  </span>
                  <span
                    className="text-[10px] ml-1"
                    style={{ color: "var(--fg-dim)" }}
                  >
                    avg
                  </span>
                </span>
              )}
              {lastWorkout.maxHeartRate && (
                <span>
                  <span className="text-[18px] font-bold">
                    {lastWorkout.maxHeartRate}
                  </span>
                  <span
                    className="text-[10px] ml-1"
                    style={{ color: "var(--fg-dim)" }}
                  >
                    max
                  </span>
                </span>
              )}
            </div>
          </div>
        )}

        {restingNow !== null && (
          <div className="space-y-1">
            <p
              className="text-[10px] uppercase tracking-wider font-semibold"
              style={{ color: "var(--fg-dim)" }}
            >
              Resting HR
            </p>
            <div className="flex items-baseline gap-2 tabular-nums">
              <span className="text-[24px] font-bold">{restingNow}</span>
              <span
                className="text-[10px]"
                style={{ color: "var(--fg-dim)" }}
              >
                bpm
              </span>
            </div>
            <p
              className="text-[11px]"
              style={{ color: trendColor }}
            >
              {restingDelta === null
                ? "today's reading"
                : restingDelta === 0
                  ? "no change vs last week"
                  : `${trendArrow} ${Math.abs(restingDelta)} bpm vs last week`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
