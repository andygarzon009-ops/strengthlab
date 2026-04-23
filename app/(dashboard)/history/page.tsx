import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { labelForType, shapeForType, formatDuration } from "@/lib/exercises";
import { format, startOfMonth, endOfMonth } from "date-fns";
import Link from "next/link";
import HistoryCalendar from "@/components/HistoryCalendar";

export default async function HistoryPage() {
  const userId = await requireAuth();

  const workouts = await prisma.workout.findMany({
    where: { userId },
    include: {
      exercises: {
        include: { sets: true, exercise: true },
        orderBy: { order: "asc" },
      },
    },
    orderBy: { date: "desc" },
  });

  const workoutIdsWithPR = new Set(
    (
      await prisma.personalRecord.findMany({
        where: {
          userId,
          workoutId: { in: workouts.map((w) => w.id) },
        },
        select: { workoutId: true },
      })
    )
      .map((p) => p.workoutId)
      .filter((x): x is string => !!x)
  );

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const workoutDateStrings = workouts.map((w) =>
    format(new Date(w.date), "yyyy-MM-dd")
  );
  const earliestYear =
    workouts.length > 0
      ? new Date(workouts[workouts.length - 1].date).getFullYear()
      : now.getFullYear();

  const avgPerWeek =
    workouts.length > 0
      ? (
          workouts.length /
          Math.max(
            1,
            Math.ceil(
              (Date.now() -
                new Date(workouts[workouts.length - 1].date).getTime()) /
                (7 * 24 * 60 * 60 * 1000)
            )
          )
        ).toFixed(1)
      : "0";

  const stats = [
    { label: "All Time", value: workouts.length },
    {
      label: "This Month",
      value: workouts.filter(
        (w) => new Date(w.date) >= monthStart && new Date(w.date) <= monthEnd
      ).length,
    },
    { label: "Per Week", value: avgPerWeek },
  ];

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-24">
      <div className="mb-8">
        <p className="label">History</p>
        <h1 className="text-[28px] font-bold tracking-tight leading-none mt-1">
          Every session
        </h1>
      </div>

      <HistoryCalendar
        workoutDates={workoutDateStrings}
        earliestYear={earliestYear}
      />

      <div
        className="grid grid-cols-3 gap-px mb-6 card overflow-hidden"
        style={{ background: "var(--border)", padding: 0 }}
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="px-3 py-4 text-center"
            style={{ background: "var(--bg-card)" }}
          >
            <p
              className="font-semibold text-[20px] leading-none tracking-tight nums"
              style={{ fontFamily: "var(--font-geist-mono)" }}
            >
              {stat.value}
            </p>
            <p
              className="label text-[9px] mt-1.5"
              style={{ color: "var(--fg-dim)" }}
            >
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {workouts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-[14px]" style={{ color: "var(--fg-muted)" }}>
            No workouts logged yet.
          </p>
          <Link
            href="/log"
            className="text-[13px] mt-3 inline-block font-semibold"
            style={{ color: "var(--accent)" }}
          >
            Log your first →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {workouts.map((workout) => {
            const typeLabel = labelForType(workout.type);
            const shape = shapeForType(workout.type);
            const workingSets = workout.exercises.flatMap((e) =>
              e.sets.filter((s) => s.type === "WORKING")
            );

            return (
              <Link
                key={workout.id}
                href={`/workout/${workout.id}`}
                className="card p-4 block transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="label text-[9px]"
                        style={{ color: "var(--fg-dim)" }}
                      >
                        {typeLabel}
                      </span>
                      {workout.isDeload && (
                        <span
                          className="label text-[9px]"
                          style={{ color: "#60a5fa" }}
                        >
                          · Deload
                        </span>
                      )}
                      {workoutIdsWithPR.has(workout.id) && (
                        <span
                          className="label text-[9px]"
                          style={{ color: "var(--accent)" }}
                        >
                          · PR
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-[15px] tracking-tight truncate">
                      {workout.title}
                    </h3>
                    <p
                      className="text-[11px] mt-1 nums"
                      style={{
                        color: "var(--fg-dim)",
                        fontFamily: "var(--font-geist-mono)",
                      }}
                    >
                      {format(new Date(workout.date), "EEE · MMM d")}
                    </p>
                  </div>
                  <div
                    className="text-right nums"
                    style={{ fontFamily: "var(--font-geist-mono)" }}
                  >
                    {shape === "STRENGTH" ? (
                      <>
                        <p className="font-semibold text-[15px] leading-tight">
                          {workout.exercises.length}
                          <span
                            className="text-[10px] ml-0.5 font-normal"
                            style={{ color: "var(--fg-dim)" }}
                          >
                            ex
                          </span>
                        </p>
                        <p
                          className="text-[11px] mt-0.5"
                          style={{ color: "var(--fg-dim)" }}
                        >
                          {workingSets.length} sets
                        </p>
                      </>
                    ) : shape === "DISTANCE" ? (
                      <>
                        <p className="font-semibold text-[15px] leading-tight">
                          {workout.distance ?? "—"}
                          {workout.distance && (
                            <span
                              className="text-[10px] ml-0.5 font-normal"
                              style={{ color: "var(--fg-dim)" }}
                            >
                              km
                            </span>
                          )}
                        </p>
                        <p
                          className="text-[11px] mt-0.5"
                          style={{ color: "var(--fg-dim)" }}
                        >
                          {formatDuration(workout.duration)}
                        </p>
                        {workout.pace && (
                          <p
                            className="text-[11px]"
                            style={{ color: "var(--fg-dim)" }}
                          >
                            {workout.pace}/km
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="font-semibold text-[15px] leading-tight">
                          {formatDuration(workout.duration)}
                        </p>
                        {workout.rounds && (
                          <p
                            className="text-[11px] mt-0.5"
                            style={{ color: "var(--fg-dim)" }}
                          >
                            {workout.rounds} rounds
                          </p>
                        )}
                        {workout.rpe && (
                          <p
                            className="text-[11px]"
                            style={{ color: "var(--fg-dim)" }}
                          >
                            RPE {workout.rpe}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {shape === "STRENGTH" && (
                  <div className="flex gap-1 mt-3 flex-wrap">
                    {workout.exercises.slice(0, 3).map((ex) => (
                      <span
                        key={ex.id}
                        className="text-[10px] px-2 py-0.5 rounded"
                        style={{
                          background: "var(--bg-elevated)",
                          color: "var(--fg-muted)",
                        }}
                      >
                        {ex.exercise.name}
                      </span>
                    ))}
                    {workout.exercises.length > 3 && (
                      <span
                        className="text-[10px] px-2 py-0.5"
                        style={{ color: "var(--fg-dim)" }}
                      >
                        +{workout.exercises.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
