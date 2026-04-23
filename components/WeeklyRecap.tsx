import { prisma } from "@/lib/db";
import { subDays, differenceInCalendarDays, format } from "date-fns";
import { shapeForType } from "@/lib/exercises";

export default async function WeeklyRecap({ userId }: { userId: string }) {
  const since = subDays(new Date(), 14);

  const [workouts, recentPR] = await Promise.all([
    prisma.workout.findMany({
      where: { userId, date: { gte: since } },
      include: {
        exercises: { include: { sets: true } },
      },
      orderBy: { date: "desc" },
    }),
    prisma.personalRecord.findFirst({
      where: { userId, type: "WEIGHT", date: { gte: subDays(new Date(), 7) } },
      include: { exercise: true },
      orderBy: { value: "desc" },
    }),
  ]);

  if (workouts.length === 0) return null;

  const weekAgo = subDays(new Date(), 7);

  const workingSetsFor = (list: typeof workouts) =>
    list
      .filter((w) => shapeForType(w.type) === "STRENGTH")
      .reduce(
        (sum, w) =>
          sum +
          w.exercises.flatMap((e) =>
            e.sets.filter((s) => s.type === "WORKING")
          ).length,
        0
      );

  const thisWeek = workouts.filter((w) => new Date(w.date) >= weekAgo);
  const lastWeek = workouts.filter((w) => new Date(w.date) < weekAgo);

  const thisSessions = thisWeek.length;
  const lastSessions = lastWeek.length;
  const sessionDelta = thisSessions - lastSessions;

  const thisSets = workingSetsFor(thisWeek);
  const lastSets = workingSetsFor(lastWeek);
  const setsDeltaPct =
    lastSets > 0 ? Math.round(((thisSets - lastSets) / lastSets) * 100) : null;

  // Streak
  const dateSet = new Set(
    (
      await prisma.workout.findMany({
        where: { userId },
        select: { date: true },
        orderBy: { date: "desc" },
        take: 365,
      })
    ).map((w) => format(new Date(w.date), "yyyy-MM-dd"))
  );
  const dates = [...dateSet].sort();
  let streak = 0;
  if (dates.length > 0) {
    const today = format(new Date(), "yyyy-MM-dd");
    const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
    const last = dates[dates.length - 1];
    if (last === today || last === yesterday) {
      streak = 1;
      for (let i = dates.length - 2; i >= 0; i--) {
        const diff = differenceInCalendarDays(
          new Date(dates[i + 1]),
          new Date(dates[i])
        );
        if (diff === 1) streak++;
        else break;
      }
    }
  }

  return (
    <div
      className="card p-5 mb-6"
      style={{
        background:
          "linear-gradient(135deg, rgba(34,197,94,0.06) 0%, var(--bg-card) 70%)",
        border: "1px solid rgba(34,197,94,0.2)",
      }}
    >
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <p className="label text-[10px]" style={{ color: "var(--accent)" }}>
            Last 7 days
          </p>
          <h2 className="text-[17px] font-bold tracking-tight mt-0.5">
            Your week in review
          </h2>
        </div>
        {streak > 0 && (
          <div className="text-right">
            <p
              className="nums text-[22px] font-bold leading-none"
              style={{
                fontFamily: "var(--font-geist-mono)",
                color: "var(--accent)",
              }}
            >
              {streak}
              <span className="text-[11px] font-normal ml-0.5">d</span>
            </p>
            <p
              className="label text-[9px] mt-0.5"
              style={{ color: "var(--fg-dim)" }}
            >
              Streak
            </p>
          </div>
        )}
      </div>

      <div
        className="grid grid-cols-2 gap-px rounded-xl overflow-hidden mb-3"
        style={{ background: "var(--border)" }}
      >
        <div
          className="p-3"
          style={{ background: "var(--bg-elevated)" }}
        >
          <p
            className="nums text-[22px] font-bold leading-none"
            style={{ fontFamily: "var(--font-geist-mono)" }}
          >
            {thisSessions}
          </p>
          <p
            className="label text-[9px] mt-1.5"
            style={{ color: "var(--fg-dim)" }}
          >
            Sessions
          </p>
          {lastSessions > 0 && (
            <p
              className="text-[10px] mt-1 nums"
              style={{
                fontFamily: "var(--font-geist-mono)",
                color:
                  sessionDelta > 0
                    ? "var(--accent)"
                    : sessionDelta < 0
                      ? "#f87171"
                      : "var(--fg-dim)",
              }}
            >
              {sessionDelta > 0 ? `+${sessionDelta}` : sessionDelta} vs last
            </p>
          )}
        </div>
        <div
          className="p-3"
          style={{ background: "var(--bg-elevated)" }}
        >
          <p
            className="nums text-[22px] font-bold leading-none"
            style={{ fontFamily: "var(--font-geist-mono)" }}
          >
            {thisSets}
          </p>
          <p
            className="label text-[9px] mt-1.5"
            style={{ color: "var(--fg-dim)" }}
          >
            Working sets
          </p>
          {setsDeltaPct !== null && (
            <p
              className="text-[10px] mt-1 nums"
              style={{
                fontFamily: "var(--font-geist-mono)",
                color:
                  setsDeltaPct > 0
                    ? "var(--accent)"
                    : setsDeltaPct < 0
                      ? "#f87171"
                      : "var(--fg-dim)",
              }}
            >
              {setsDeltaPct > 0 ? `+${setsDeltaPct}` : setsDeltaPct}% vs last
            </p>
          )}
        </div>
      </div>

      {recentPR && (
        <div
          className="flex items-center gap-3 p-3 rounded-xl"
          style={{ background: "var(--bg-elevated)" }}
        >
          <div className="text-[22px]">🏋️</div>
          <div className="flex-1 min-w-0">
            <p
              className="label text-[9px]"
              style={{ color: "var(--accent)" }}
            >
              PR this week
            </p>
            <p className="text-[13px] font-semibold truncate">
              {recentPR.exercise.name}
            </p>
          </div>
          <p
            className="nums text-[15px] font-bold shrink-0"
            style={{
              fontFamily: "var(--font-geist-mono)",
              color: "var(--accent)",
            }}
          >
            {recentPR.value}
            <span className="text-[10px] font-normal opacity-70 ml-0.5">
              lb × {recentPR.reps ?? 1}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
