import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import {
  FEELING_OPTIONS,
  STRENGTH_SPLITS,
  labelForType,
  shapeForType,
  formatDuration,
} from "@/lib/exercises";
import { formatLongDate } from "@/lib/dateFormat";
import Link from "next/link";
import { deleteWorkout } from "@/lib/actions/workouts";
import BackButton from "@/components/BackButton";
import ReactionButtons from "@/components/ReactionButtons";
import CommentSection from "@/components/CommentSection";
import DeleteWorkoutButton from "@/components/DeleteWorkoutButton";
import WorkoutHRChart from "@/components/WorkoutHRChart";
import SyncHRButton from "@/components/SyncHRButton";
import { WarmupSummary } from "@/components/GuidedWarmup";

type WarmupShape = {
  items: {
    kind?: "cardio" | "mobility" | "activation";
    name: string;
    durationSec?: number;
    reps?: number;
    instructions?: string;
  }[];
};

export default async function WorkoutDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireAuth();
  const { id } = await params;

  const workout = await prisma.workout.findUnique({
    where: { id },
    include: {
      user: true,
      exercises: {
        include: {
          exercise: true,
          sets: { orderBy: { setNumber: "asc" } },
        },
        orderBy: { order: "asc" },
      },
      reactions: { include: { user: true } },
      comments: { include: { user: true }, orderBy: { createdAt: "asc" } },
    },
  });

  if (!workout)
    return (
      <div className="p-4" style={{ color: "var(--fg-muted)" }}>
        Workout not found
      </div>
    );

  const prs = await prisma.personalRecord.findMany({
    where: { workoutId: id, userId },
    include: { exercise: true },
  });

  const hrSamples = await prisma.workoutHeartRateSample.findMany({
    where: { workoutId: id },
    orderBy: { timestamp: "asc" },
    select: { timestamp: true, bpm: true },
  });

  const typeLabel = labelForType(workout.type);
  const shape = shapeForType(workout.type);
  const splitLabel = workout.split
    ? STRENGTH_SPLITS.find((s) => s.value === workout.split)?.label
    : null;
  const feeling = FEELING_OPTIONS.find((f) => f.value === workout.feeling);
  const isOwn = workout.userId === userId;

  const totalSets = workout.exercises.flatMap((e) =>
    e.sets.filter((s) => (s.type === "WORKING" || s.type === "SUPERSET" || s.type === "DROP_SET"))
  ).length;
  const topSetWeight = workout.exercises
    .flatMap((e) => e.sets.filter((s) => (s.type === "WORKING" || s.type === "SUPERSET" || s.type === "DROP_SET")))
    .reduce((max, s) => Math.max(max, s.weight ?? 0), 0);

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-24">
      <div className="flex items-center justify-between mb-8">
        <BackButton fallbackHref="/" />
        {isOwn && (
          <div className="flex items-center gap-3">
            <Link
              href={`/workout/${id}/edit`}
              className="text-[12px] label"
              style={{ color: "var(--accent)" }}
            >
              Edit
            </Link>
            <span
              className="text-[10px]"
              style={{ color: "var(--fg-dim)" }}
            >
              ·
            </span>
            <DeleteWorkoutButton
              title={workout.title}
              action={async () => {
                "use server";
                await deleteWorkout(id);
              }}
            />
          </div>
        )}
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span
            className="label text-[9px] px-2 py-1 rounded-md"
            style={{
              background: "var(--bg-elevated)",
              color: "var(--fg-muted)",
            }}
          >
            {typeLabel}
          </span>
          {splitLabel && (
            <span
              className="label text-[9px] px-2 py-1 rounded-md"
              style={{
                background: "var(--bg-elevated)",
                color: "var(--fg-muted)",
              }}
            >
              {splitLabel}
            </span>
          )}
          {feeling && (
            <span
              className="label text-[9px] px-2 py-1 rounded-md"
              style={{
                background: "var(--accent-dim)",
                color: "var(--accent)",
              }}
            >
              {feeling.label}
            </span>
          )}
          {workout.isDeload && (
            <span
              className="label text-[9px] px-2 py-1 rounded-md"
              style={{
                background: "rgba(96,165,250,0.1)",
                color: "#60a5fa",
              }}
            >
              Deload
            </span>
          )}
        </div>
        <h1 className="text-[28px] font-bold tracking-tight leading-tight">
          {workout.title}
        </h1>
        <p
          className="text-[12px] mt-1.5 nums"
          style={{
            color: "var(--fg-dim)",
            fontFamily: "var(--font-geist-mono)",
          }}
        >
          {formatLongDate(workout.date, workout.user.timezone)}
          {!isOwn && ` · by ${workout.user.name}`}
        </p>
        {workout.notes && (
          <p
            className="text-[13px] mt-4 leading-relaxed rounded-xl px-4 py-3"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--fg-muted)",
            }}
          >
            {workout.notes}
          </p>
        )}
      </div>

      <StatsGrid
        stats={
          shape === "STRENGTH"
            ? [
                { label: "Exercises", value: workout.exercises.length },
                { label: "Working Sets", value: totalSets },
                {
                  label: "Top set",
                  value: topSetWeight > 0 ? topSetWeight : "—",
                  suffix: topSetWeight > 0 ? "lb" : undefined,
                },
              ]
            : shape === "DISTANCE"
              ? [
                  {
                    label: "Distance",
                    value: workout.distance ?? "—",
                    suffix: workout.distance ? "km" : undefined,
                  },
                  {
                    label: "Time",
                    value: formatDuration(workout.duration),
                  },
                  {
                    label: "Pace",
                    value: workout.pace ?? "—",
                    suffix: workout.pace ? "/km" : undefined,
                  },
                ]
              : [
                  {
                    label: "Time",
                    value: formatDuration(workout.duration),
                  },
                  {
                    label: "Rounds",
                    value: workout.rounds ?? "—",
                  },
                  {
                    label: "RPE",
                    value: workout.rpe ?? "—",
                    suffix: workout.rpe ? "/10" : undefined,
                  },
                ]
        }
      />

      {workout.warmup &&
        Array.isArray((workout.warmup as WarmupShape).items) &&
        (workout.warmup as WarmupShape).items.length > 0 && (
          <WarmupSummary items={(workout.warmup as WarmupShape).items} />
        )}

      {hrSamples.length > 0 && (
        <div className="mb-4">
          <WorkoutHRChart
            samples={hrSamples.map((s) => ({
              timestamp: s.timestamp.toISOString(),
              bpm: s.bpm,
            }))}
            setMarkers={workout.exercises.flatMap((ex) =>
              ex.sets
                .filter((s) => s.loggedAt && (s.type === "WORKING" || s.type === "SUPERSET" || s.type === "DROP_SET"))
                .map((s) => ({
                  timestamp: s.loggedAt!.toISOString(),
                  label: `${ex.exercise.name} · ${s.weight ?? "—"}×${s.reps ?? "—"}`,
                }))
            )}
          />
        </div>
      )}

      {isOwn && <SyncHRButton workoutId={workout.id} />}

      {/* Secondary metrics: HR, elevation, calories, steps, active zone min */}
      {(() => {
        const chips: { label: string; value: string | number; suffix?: string }[] = [];
        // Strength sessions don't show duration in the primary card, so
        // surface it here once it's been synced from Fitbit (or entered).
        if (shape === "STRENGTH" && workout.duration && workout.duration > 0)
          chips.push({ label: "Duration", value: formatDuration(workout.duration) });
        if (workout.avgHeartRate)
          chips.push({ label: "Avg HR", value: workout.avgHeartRate, suffix: "bpm" });
        if (workout.maxHeartRate)
          chips.push({ label: "Max HR", value: workout.maxHeartRate, suffix: "bpm" });
        if (workout.calories)
          chips.push({ label: "Calories", value: workout.calories, suffix: "kcal" });
        if (workout.activeZoneMin && workout.activeZoneMin > 0)
          chips.push({ label: "Zone min", value: workout.activeZoneMin, suffix: "min" });
        if (workout.steps && workout.steps > 0)
          chips.push({ label: "Steps", value: workout.steps.toLocaleString() });
        if (workout.elevation)
          chips.push({ label: "Elevation", value: workout.elevation, suffix: "m" });
        if (chips.length === 0) return null;
        return (
          <div className="grid grid-cols-2 gap-2 mb-6">
            {chips.map((c) => (
              <MetricChip key={c.label} label={c.label} value={c.value} suffix={c.suffix} />
            ))}
          </div>
        );
      })()}

      {prs.length > 0 && (
        <div
          className="rounded-2xl p-4 mb-6"
          style={{
            background: "var(--accent-dim)",
            border: "1px solid rgba(34,197,94,0.3)",
          }}
        >
          <p
            className="label mb-2"
            style={{ color: "var(--accent)" }}
          >
            Personal Records
          </p>
          <div className="space-y-1">
            {prs.map((pr) => (
              <p key={pr.id} className="text-[13px]">
                <span className="font-semibold">{pr.exercise.name}</span>
                <span style={{ color: "var(--fg-muted)" }}> — </span>
                <span
                  className="nums font-semibold"
                  style={{
                    color: "var(--accent)",
                    fontFamily: "var(--font-geist-mono)",
                  }}
                >
                  {pr.type === "WEIGHT"
                    ? `${pr.value}lb`
                    : pr.type === "REPS"
                      ? pr.value > 0
                        ? `${pr.reps ?? 0} reps @ ${pr.value}lb`
                        : `${pr.reps ?? 0} reps`
                      : `${pr.value}lb vol`}
                </span>
              </p>
            ))}
          </div>
        </div>
      )}

      {shape === "STRENGTH" && (() => {
        // Cluster contiguous exercises sharing a supersetGroup into a
        // single card so the workout view mirrors how it was logged.
        type Cluster = {
          groupId: string | null;
          items: typeof workout.exercises;
        };
        const clusters: Cluster[] = [];
        for (const ex of workout.exercises) {
          const g = ex.supersetGroup ?? null;
          const last = clusters[clusters.length - 1];
          if (g && last && last.groupId === g) last.items.push(ex);
          else clusters.push({ groupId: g, items: [ex] });
        }
        const letterMap = new Map<string, string>();
        let code = 65;
        for (const c of clusters) {
          if (c.groupId && c.items.length >= 2 && !letterMap.has(c.groupId)) {
            letterMap.set(c.groupId, String.fromCharCode(code++));
          }
        }
        return (
          <div className="space-y-3 mb-6">
            {clusters.map((cluster, ci) => {
              const isSuperset =
                !!cluster.groupId && cluster.items.length >= 2;
              const letter = cluster.groupId
                ? letterMap.get(cluster.groupId)
                : null;
              return (
                <div
                  key={`${ci}-${cluster.groupId ?? "solo"}`}
                  className="card overflow-hidden"
                  style={
                    isSuperset
                      ? { borderLeft: "3px solid var(--accent)" }
                      : undefined
                  }
                >
                  {isSuperset && (
                    <div className="px-4 pt-3 pb-1">
                      <span
                        className="label text-[9px]"
                        style={{ color: "var(--accent)" }}
                      >
                        Superset {letter} · {cluster.items.length} lifts
                      </span>
                    </div>
                  )}
                  {cluster.items.map((ex, mi) => {
                    const warmupSets = ex.sets.filter(
                      (s) => s.type === "WARMUP"
                    );
                    // Build chains so each WORKING/SUPERSET parent owns
                    // any DROP_SETs that immediately follow it in the
                    // sets array (mirrors how the logger renders them).
                    type ViewChain = {
                      parent: typeof ex.sets[number];
                      drops: typeof ex.sets;
                    };
                    const workingChains: ViewChain[] = [];
                    const supersetChains: ViewChain[] = [];
                    for (let i = 0; i < ex.sets.length; i++) {
                      const s = ex.sets[i];
                      if (s.type !== "WORKING" && s.type !== "SUPERSET")
                        continue;
                      const drops: typeof ex.sets = [];
                      let j = i + 1;
                      while (
                        j < ex.sets.length &&
                        ex.sets[j].type === "DROP_SET"
                      ) {
                        drops.push(ex.sets[j]);
                        j++;
                      }
                      const c = { parent: s, drops };
                      if (s.type === "WORKING") workingChains.push(c);
                      else supersetChains.push(c);
                    }
                    return (
                      <div
                        key={ex.id}
                        style={
                          mi > 0
                            ? { borderTop: "1px solid var(--border)" }
                            : undefined
                        }
                      >
                        <div className="p-4 pb-3">
                          <h3 className="font-semibold text-[15px] tracking-tight">
                            {ex.exercise.name}
                          </h3>
                          {ex.notes && (
                            <p
                              className="text-[11px] mt-1 italic"
                              style={{ color: "var(--fg-dim)" }}
                            >
                              {ex.notes}
                            </p>
                          )}
                        </div>

                        {warmupSets.length > 0 && (
                          <div className="px-4 pb-3">
                            <p className="label mb-2">Warm-up</p>
                            {warmupSets.map((s) => (
                              <SetLine
                                key={s.id}
                                num={s.setNumber}
                                weight={s.weight}
                                reps={s.reps}
                                rir={s.rir}
                                isWarmup
                              />
                            ))}
                          </div>
                        )}

                        {workingChains.length > 0 && (
                          <div
                            className="px-4 py-3"
                            style={{
                              borderTop:
                                warmupSets.length > 0
                                  ? "1px solid var(--border)"
                                  : "none",
                            }}
                          >
                            <p className="label mb-2">Working sets</p>
                            {workingChains.map((c, ci) => (
                              <div key={c.parent.id}>
                                <SetLine
                                  num={ci + 1}
                                  weight={c.parent.weight}
                                  reps={c.parent.reps}
                                  rir={c.parent.rir}
                                  note={c.parent.notes}
                                />
                                {c.drops.map((d) => (
                                  <SetLine
                                    key={d.id}
                                    num={d.setNumber}
                                    weight={d.weight}
                                    reps={d.reps}
                                    rir={d.rir}
                                    note={d.notes}
                                    isDrop
                                  />
                                ))}
                              </div>
                            ))}
                          </div>
                        )}

                        {supersetChains.length > 0 && (
                          <div
                            className="px-4 py-3"
                            style={{
                              borderTop:
                                warmupSets.length > 0 ||
                                workingChains.length > 0
                                  ? "1px solid var(--border)"
                                  : "none",
                            }}
                          >
                            <p
                              className="label mb-2"
                              style={{ color: "var(--accent)" }}
                            >
                              Superset
                            </p>
                            {supersetChains.map((c, ci) => (
                              <div key={c.parent.id}>
                                <SetLine
                                  num={ci + 1}
                                  weight={c.parent.weight}
                                  reps={c.parent.reps}
                                  rir={c.parent.rir}
                                  note={c.parent.notes}
                                />
                                {c.drops.map((d) => (
                                  <SetLine
                                    key={d.id}
                                    num={d.setNumber}
                                    weight={d.weight}
                                    reps={d.reps}
                                    rir={d.rir}
                                    note={d.notes}
                                    isDrop
                                  />
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })()}

      <div className="card p-4 mb-3">
        <ReactionButtons
          workoutId={workout.id}
          reactions={workout.reactions}
          currentUserId={userId}
        />
      </div>

      <div className="card overflow-hidden">
        <CommentSection
          workoutId={workout.id}
          comments={workout.comments}
          currentUserId={userId}
        />
      </div>
    </div>
  );
}

function SetLine({
  num,
  weight,
  reps,
  rir,
  note,
  isWarmup,
  isDrop,
}: {
  num: number;
  weight: number | null;
  reps: number | null;
  rir: number | null;
  note?: string | null;
  isWarmup?: boolean;
  isDrop?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-3 mb-1 nums"
      style={{
        fontFamily: "var(--font-geist-mono)",
        ...(isDrop ? { paddingLeft: 18 } : {}),
      }}
    >
      <span
        className="text-[11px] w-4 text-center font-semibold"
        style={{
          color:
            isDrop || isWarmup ? "var(--fg-dim)" : "var(--accent)",
        }}
      >
        {isDrop ? "↘" : num}
      </span>
      <span
        className="text-[13px] font-medium"
        style={{ color: isWarmup ? "var(--fg-muted)" : "var(--fg)" }}
      >
        {weight ?? "—"}
        <span
          style={{ color: "var(--fg-dim)", fontSize: "11px" }}
          className="ml-0.5"
        >
          lb
        </span>
        <span className="mx-1.5" style={{ color: "var(--fg-dim)" }}>
          ×
        </span>
        {reps ?? "—"}
      </span>
      {rir != null && (
        <span className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
          RIR {rir}
        </span>
      )}
      {note && (
        <span
          className="text-[11px] italic truncate"
          style={{ color: "var(--fg-dim)", fontFamily: "inherit" }}
        >
          {note}
        </span>
      )}
    </div>
  );
}

function StatsGrid({
  stats,
}: {
  stats: {
    label: string;
    value: string | number;
    suffix?: string;
  }[];
}) {
  return (
    <div
      className="grid grid-cols-3 gap-px card overflow-hidden mb-3"
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
            {stat.suffix && (
              <span
                className="text-[11px] ml-0.5 font-normal"
                style={{ color: "var(--fg-dim)" }}
              >
                {stat.suffix}
              </span>
            )}
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
  );
}

function MetricChip({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string | number;
  suffix?: string;
}) {
  return (
    <div className="card px-3 py-2.5 flex items-baseline justify-between">
      <span
        className="label text-[9px]"
        style={{ color: "var(--fg-dim)" }}
      >
        {label}
      </span>
      <span
        className="text-[14px] font-semibold nums"
        style={{ fontFamily: "var(--font-geist-mono)" }}
      >
        {value}
        {suffix && (
          <span
            className="text-[10px] ml-0.5 font-normal"
            style={{ color: "var(--fg-dim)" }}
          >
            {suffix}
          </span>
        )}
      </span>
    </div>
  );
}
