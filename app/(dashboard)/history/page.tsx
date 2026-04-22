import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { labelForType, shapeForType, formatDuration } from "@/lib/exercises";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
} from "date-fns";
import Link from "next/link";

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

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const workoutDates = new Set(
    workouts.map((w) => format(new Date(w.date), "yyyy-MM-dd"))
  );
  const startDayOfWeek = getDay(monthStart);

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

      <div className="card p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold text-[14px] tracking-tight">
            {format(now, "MMMM yyyy")}
          </p>
          <p
            className="label text-[9px] nums"
            style={{
              color: "var(--fg-dim)",
              fontFamily: "var(--font-geist-mono)",
            }}
          >
            {workoutDates.size} sessions
          </p>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div
              key={i}
              className="text-[10px] pb-2"
              style={{ color: "var(--fg-dim)" }}
            >
              {d}
            </div>
          ))}
          {Array.from({ length: startDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const hasWorkout = workoutDates.has(key);
            const isToday = key === format(now, "yyyy-MM-dd");
            return (
              <div
                key={key}
                className="aspect-square flex items-center justify-center rounded-md text-[12px] nums"
                style={{
                  fontFamily: "var(--font-geist-mono)",
                  background: hasWorkout
                    ? "var(--accent)"
                    : isToday
                      ? "var(--bg-elevated)"
                      : "transparent",
                  color: hasWorkout
                    ? "#0a0a0a"
                    : isToday
                      ? "var(--fg)"
                      : "var(--fg-dim)",
                  fontWeight: hasWorkout || isToday ? 600 : 400,
                  border: isToday && !hasWorkout ? "1px solid var(--border-strong)" : "none",
                }}
              >
                {format(day, "d")}
              </div>
            );
          })}
        </div>
      </div>

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
            const totalVolume = workingSets.reduce(
              (sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0),
              0
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
                        {totalVolume > 0 && (
                          <p
                            className="text-[11px]"
                            style={{ color: "var(--fg-dim)" }}
                          >
                            {totalVolume >= 1000
                              ? `${(totalVolume / 1000).toFixed(1)}k`
                              : totalVolume}
                            lb
                          </p>
                        )}
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
