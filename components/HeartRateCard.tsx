import Link from "next/link";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { refreshRestingHr } from "@/lib/restingHr";

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

// Refresh the stored resting HR at most this often (background, post-response).
const RESTING_STALE_MS = 2 * 60 * 60 * 1000; // 2 hours

export default async function HeartRateCard({ userId }: Props) {
  // Read last-known resting HR straight from the DB — instant, no Google call.
  const account = await prisma.healthAccount.findUnique({
    where: { userId },
    select: {
      id: true,
      restingHr: true,
      restingDelta: true,
      restingSource: true,
      restingHrAt: true,
    },
  });
  if (!account) return null;

  // If it's stale, kick off a refresh AFTER the response is sent — never blocks
  // the feed. The new value shows up on the next load / sync.
  const stale =
    !account.restingHrAt ||
    Date.now() - account.restingHrAt.getTime() > RESTING_STALE_MS;
  if (stale) after(() => refreshRestingHr(userId));

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
      startedAt: true,
      endedAt: true,
      avgHeartRate: true,
      maxHeartRate: true,
    },
  });

  const restingNow = account.restingHr;
  const restingDelta = account.restingDelta;
  const restingSource = account.restingSource;

  // Nothing useful to show yet.
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
    <Link
      href="/heart-rate"
      className="block rounded-2xl p-4 mb-3 transition-colors"
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
        <span style={{ color: "var(--fg-dim)" }}>→</span>
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
              {formatRelative(
                lastWorkout.endedAt ?? lastWorkout.startedAt ?? lastWorkout.date,
              )}
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
              <span className="text-[10px]" style={{ color: "var(--fg-dim)" }}>
                bpm
              </span>
            </div>
            <p className="text-[11px]" style={{ color: trendColor }}>
              {restingDelta !== null && restingDelta !== 0
                ? `${trendArrow} ${Math.abs(restingDelta)} bpm vs last week`
                : restingSource === "computed"
                  ? "estimated from today's HR"
                  : "today's reading"}
            </p>
          </div>
        )}
      </div>
    </Link>
  );
}
