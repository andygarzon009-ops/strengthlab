import Link from "next/link";
import { format, subDays, differenceInDays } from "date-fns";
import Anthropic from "@anthropic-ai/sdk";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { shapeForType, labelForType, isMachineExercise } from "@/lib/exercises";
import { mergeLiftsWithTargets } from "@/lib/strengthProgression";
import { normalizeExerciseName } from "@/lib/exerciseIdentity";
import { computeWeakSpots } from "@/lib/weakSpots";
import TopLiftsCard from "@/components/TopLiftsCard";
import CoverageBars, { type MuscleCoverage } from "@/components/CoverageBars";
import MomentumBars, { type MomentumStats } from "@/components/MomentumBars";
import Projections from "@/components/Projections";
import WeakSpots from "@/components/WeakSpots";
import BackButton from "@/components/BackButton";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DAY_ABBR_MON_FIRST = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Muscle groups the body scan renders. "Lower Back" folds into Back and
// "Other"/null are dropped — see normalizeMuscle.
const SCAN_MUSCLES = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Forearms",
  "Core",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Calves",
] as const;

function normalizeMuscle(mg: string | null | undefined): string | null {
  if (!mg) return null;
  if (mg === "Lower Back") return "Back";
  if (mg === "Other") return null;
  return mg;
}

type SetLike = { type: string };
type ExerciseLike = {
  exercise: { muscleGroup: string | null };
  sets: SetLike[];
};
type WorkoutLikeForCoverage = { exercises: ExerciseLike[] };

function workingSetCount(sets: SetLike[]): number {
  return sets.reduce((n, s) => (s.type !== "WARMUP" ? n + 1 : n), 0);
}

// Per-muscle working-set tally across a set of sessions.
function setsByMuscle(
  sessions: WorkoutLikeForCoverage[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const w of sessions) {
    for (const e of w.exercises) {
      const m = normalizeMuscle(e.exercise.muscleGroup);
      if (!m) continue;
      const n = workingSetCount(e.sets);
      if (n > 0) out[m] = (out[m] ?? 0) + n;
    }
  }
  return out;
}

// Total working sets across sessions (every muscle, including untagged).
function totalWorkingSets(sessions: WorkoutLikeForCoverage[]): number {
  let total = 0;
  for (const w of sessions) {
    for (const e of w.exercises) total += workingSetCount(e.sets);
  }
  return total;
}

type SessionForAnalysis = {
  title: string;
  type: string;
  split: string | null;
  isDeload: boolean;
  feeling: string | null;
  duration: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  exercises: {
    exercise: { name: string; muscleGroup: string | null };
    sets: { type: string }[];
  }[];
};

type CoachAnalysis = {
  rhythm: {
    verdict: "Strong" | "Steady" | "Light" | "Inconsistent";
    line: string;
  };
  coverage: {
    trained: string[];
    missed: string[];
    note: string;
  };
  momentum: {
    direction: "up" | "flat" | "down";
    line: string;
  };
  nextWeek: string[];
};

type AnalysisResult =
  | { ok: true; analysis: CoachAnalysis }
  | { ok: false; error: string };

export default async function ConsistencyDetailPage() {
  const userId = await requireAuth();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      timezone: true,
      trainingDays: true,
      preferredSplit: true,
      experienceLevel: true,
      primaryFocus: true,
      weeklyAnalysisCache: true,
    },
  });
  const tz = user?.timezone ?? "UTC";

  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);

  // Calendar-week strip anchored Mon → Sun in the user's tz. Find this
  // week's Monday by walking back from "today" until we hit Monday (1).
  const now = new Date();
  const todayWeekday = dowInTz(now, tz);
  // ISO weekday: Mon=1 … Sun=7. JS getDay: Sun=0…Sat=6. Convert.
  const isoToday = todayWeekday === 0 ? 7 : todayWeekday;
  const monday = new Date(now.getTime() - (isoToday - 1) * 24 * 60 * 60 * 1000);
  // Window covers Mon 00:00 → next Mon 00:00 in tz; cheap fetch covers it.
  const weekStart = new Date(
    monday.getTime() - 7 * 24 * 60 * 60 * 1000, // fetch 14 days for momentum compare
  );

  const recent = await prisma.workout.findMany({
    where: { userId, date: { gte: weekStart } },
    include: {
      exercises: {
        include: { exercise: true, sets: { orderBy: { setNumber: "asc" } } },
        orderBy: { order: "asc" },
      },
    },
    orderBy: { date: "asc" },
  });

  const grid: {
    dateKey: string;
    weekday: string;
    isToday: boolean;
    isFuture: boolean;
    sessions: typeof recent;
  }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getTime() + i * 24 * 60 * 60 * 1000);
    const k = dayKey(d);
    const todayKey = dayKey(now);
    const dKey = k;
    grid.push({
      dateKey: k,
      weekday: DAY_ABBR_MON_FIRST[i],
      isToday: k === todayKey,
      isFuture: dKey > todayKey,
      sessions: recent.filter((w) => dayKey(w.date) === k),
    });
  }
  const trainedDays = grid.filter((g) => g.sessions.length > 0).length;
  const goalDays = user?.trainingDays ?? null;

  // Last week's totals for the momentum comparison the LLM uses.
  const lastWeekStart = new Date(
    monday.getTime() - 7 * 24 * 60 * 60 * 1000,
  );
  const lastWeekKeys = new Set<string>();
  for (let i = 0; i < 7; i++) {
    lastWeekKeys.add(
      dayKey(new Date(lastWeekStart.getTime() + i * 24 * 60 * 60 * 1000)),
    );
  }
  const lastWeekSessions = recent.filter((w) =>
    lastWeekKeys.has(dayKey(w.date)),
  );

  // Cache key encodes the week + this-week workout count + last-edit
  // timestamp. As long as nothing about the week's data has changed since
  // the cached analysis was written, we reuse it and skip the model call.
  const weekKey = dayKey(monday);
  const thisWeekKeys = new Set(grid.map((g) => g.dateKey));
  const thisWeekSessions = recent.filter((w) =>
    thisWeekKeys.has(dayKey(w.date)),
  );
  const latestUpdate = thisWeekSessions.reduce(
    (max, w) => Math.max(max, w.updatedAt.getTime()),
    0,
  );
  const fingerprint = `${weekKey}|${thisWeekSessions.length}|${latestUpdate}`;

  // Top lifts need a longer lookback to compute the 4-week baseline. Pull
  // the last 12 weeks of strength workouts in one query.
  const twelveWeeksAgo = new Date(now.getTime() - 12 * 7 * 86400_000);
  const liftHistory = await prisma.workout.findMany({
    where: { userId, date: { gte: twelveWeeksAgo } },
    select: {
      date: true,
      startedAt: true,
      endedAt: true,
      type: true,
      exercises: {
        select: {
          exercise: {
            select: { id: true, name: true, muscleGroup: true },
          },
          sets: {
            select: { type: true, weight: true, reps: true },
          },
        },
      },
    },
  });
  const goals = await prisma.goal.findMany({
    where: { userId, completed: false, exerciseId: { not: null } },
    select: { id: true, exerciseId: true, targetValue: true, targetReps: true },
  });
  const topLifts = mergeLiftsWithTargets(liftHistory, goals);

  // Stub-row targets have no exercise name yet — backfill from the DB so
  // the row reads "Bench Press" instead of "Lift".
  const stubIds = topLifts
    .filter((l) => l.sessions === 0)
    .map((l) => l.exerciseId);
  if (stubIds.length > 0) {
    const stubExercises = await prisma.exercise.findMany({
      where: { id: { in: stubIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(stubExercises.map((e) => [e.id, e.name]));
    for (const l of topLifts) {
      if (l.sessions === 0 && nameById.has(l.exerciseId)) {
        l.name = nameById.get(l.exerciseId)!;
      }
    }
  }

  // ---- Projections (estimated 1RM via Epley) ----
  // Best straight WORKING set per lift where reps ≤ 10 (Epley is unreliable
  // higher). Machine lifts and near-duplicate names are collapsed so a
  // single movement doesn't split across rows. Drawn from the 12-week
  // history already in memory — recent maxes, no extra query.
  const bestByExercise = new Map<
    string,
    { exerciseName: string; weight: number; reps: number; oneRM: number }
  >();
  for (const w of liftHistory) {
    for (const ex of w.exercises) {
      if (isMachineExercise(ex.exercise.name)) continue;
      const key = normalizeExerciseName(ex.exercise.name) || ex.exercise.id;
      for (const s of ex.sets) {
        if (s.type !== "WORKING") continue;
        const weight = s.weight ?? 0;
        const reps = s.reps ?? 0;
        if (weight <= 0 || reps <= 0 || reps > 10) continue;
        const oneRM = weight * (1 + reps / 30);
        const prev = bestByExercise.get(key);
        if (!prev || oneRM > prev.oneRM) {
          bestByExercise.set(key, {
            exerciseName: ex.exercise.name,
            weight,
            reps,
            oneRM,
          });
        }
      }
    }
  }
  const projections = [...bestByExercise.values()]
    .sort((a, b) => b.oneRM - a.oneRM)
    .map((p) => ({
      exerciseName: p.exerciseName,
      baseWeight: p.weight,
      baseReps: p.reps,
      oneRepMax: p.oneRM,
    }));

  // ---- Training streak — consecutive days ending today or yesterday ----
  const streakDays = (() => {
    if (liftHistory.length === 0) return 0;
    const dates = [
      ...new Set(liftHistory.map((w) => format(new Date(w.date), "yyyy-MM-dd"))),
    ].sort();
    const today = format(new Date(), "yyyy-MM-dd");
    const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
    const lastDate = dates[dates.length - 1];
    if (lastDate !== today && lastDate !== yesterday) return 0;
    let streak = 1;
    for (let i = dates.length - 2; i >= 0; i--) {
      const diff = differenceInDays(new Date(dates[i + 1]), new Date(dates[i]));
      if (diff === 1) streak++;
      else break;
    }
    return streak;
  })();

  // ---- Weak spots — same analyzer the old Stats page used ----
  const weakSpots = computeWeakSpots(
    liftHistory.map((w) => ({
      date: w.date,
      type: w.type,
      exercises: w.exercises.map((e) => ({
        exerciseId: e.exercise.id,
        exercise: { name: e.exercise.name },
        sets: e.sets,
      })),
    })),
    { trainingDays: user?.trainingDays ?? null },
  );

  // ---- Body-scan coverage + momentum (computed, not model-generated) ----
  const thisWeekByMuscle = setsByMuscle(thisWeekSessions);
  const lastWeekByMuscle = setsByMuscle(lastWeekSessions);

  // Most-recent working set per muscle across the 12-week lift history so the
  // scan can show "last trained" even for muscles untouched this week.
  const lastTrainedByMuscle: Record<string, number> = {};
  for (const w of liftHistory) {
    const at = (w.endedAt ?? w.startedAt ?? w.date).getTime();
    for (const e of w.exercises) {
      const m = normalizeMuscle(e.exercise.muscleGroup);
      if (!m) continue;
      if (workingSetCount(e.sets) === 0) continue;
      if (at > (lastTrainedByMuscle[m] ?? 0)) lastTrainedByMuscle[m] = at;
    }
  }

  const bodyCoverage: MuscleCoverage[] = SCAN_MUSCLES.map((m) => ({
    muscle: m,
    thisWeek: thisWeekByMuscle[m] ?? 0,
    lastWeek: lastWeekByMuscle[m] ?? 0,
    lastTrainedIso: lastTrainedByMuscle[m]
      ? new Date(lastTrainedByMuscle[m]).toISOString()
      : null,
  }));

  const momentumStats: MomentumStats = {
    thisWeekSets: totalWorkingSets(thisWeekSessions),
    lastWeekSets: totalWorkingSets(lastWeekSessions),
    thisWeekSessions: thisWeekSessions.length,
    lastWeekSessions: lastWeekSessions.length,
  };

  let analysis: AnalysisResult;
  const cached = user?.weeklyAnalysisCache as
    | { fingerprint?: string; analysis?: CoachAnalysis }
    | null
    | undefined;
  if (cached?.fingerprint === fingerprint && cached.analysis) {
    analysis = { ok: true, analysis: cached.analysis };
  } else {
    analysis = await generateAnalysis({
      name: user?.name ?? "Athlete",
      goalDays,
      experienceLevel: user?.experienceLevel ?? null,
      primaryFocus: user?.primaryFocus ?? null,
      preferredSplit: user?.preferredSplit ?? null,
      trainedDays,
      grid: grid.map((g) => ({
        ...g,
        sessions: g.sessions as unknown as SessionForAnalysis[],
      })),
      lastWeekSessionCount: lastWeekSessions.length,
    });
    if (analysis.ok) {
      // Persist so next visit is free. Failures aren't cached — we'll retry.
      await prisma.user.update({
        where: { id: userId },
        data: {
          weeklyAnalysisCache: {
            fingerprint,
            analysis: analysis.analysis,
          } as unknown as object,
        },
      });
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-24">
      <div className="flex items-center gap-3 mb-5">
        <BackButton href="/" ariaLabel="Back to feed" />
        <div className="flex-1 min-w-0">
          <h1 className="text-[22px] font-bold tracking-tight leading-none">
            Progress
          </h1>
          <p className="text-[12px] mt-1" style={{ color: "var(--fg-dim)" }}>
            This week ({format(monday, "MMM d")} – {format(new Date(monday.getTime() + 6 * 86400_000), "MMM d")}) ·{" "}
            {trainedDays}
            {goalDays ? ` / ${goalDays}` : ""} days trained
          </p>
        </div>
        {streakDays > 0 && (
          <div
            className="shrink-0 text-right px-3 py-2 rounded-xl"
            style={{
              background: "var(--accent-dim)",
              border: "1px solid rgba(34,197,94,0.3)",
            }}
          >
            <p className="label text-[9px]" style={{ color: "var(--accent)" }}>
              Streak
            </p>
            <p
              className="nums font-bold text-[18px] leading-none tracking-tight mt-0.5"
              style={{
                color: "var(--accent)",
                fontFamily: "var(--font-geist-mono)",
              }}
            >
              {streakDays}
              <span className="text-[11px] font-normal ml-0.5 opacity-70">
                d
              </span>
            </p>
          </div>
        )}
      </div>

      <WeekStrip grid={grid} />

      {analysis.ok ? (
        <ThisWeekCard
          analysis={analysis.analysis}
          momentumStats={momentumStats}
        />
      ) : (
        <div
          className="rounded-2xl p-5 mb-3"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
        >
          <p
            className="text-[13px] mb-2"
            style={{ color: "var(--fg-dim)" }}
          >
            Coach analysis unavailable. Pull to refresh.
          </p>
          <p
            className="text-[10px] font-mono break-all"
            style={{ color: "#f97316" }}
          >
            {analysis.error}
          </p>
        </div>
      )}

      <TopLiftsCard lifts={topLifts} />

      <div className="mt-3 space-y-3">
        <Projections items={projections} href="/strength" />

        {/* Coverage — interactive body scan */}
        <div
          className="rounded-2xl p-4"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
        >
          <p
            className="text-[10px] uppercase tracking-wider font-semibold mb-3"
            style={{ color: "var(--fg-dim)" }}
          >
            Coverage
          </p>
          <CoverageBars
            coverage={bodyCoverage}
            note={analysis.ok ? analysis.analysis.coverage.note : ""}
          />
        </div>
      </div>

      <div className="mt-6">
        <WeakSpots spots={weakSpots} />
      </div>
    </div>
  );
}

function WeekStrip({
  grid,
}: {
  grid: {
    dateKey: string;
    weekday: string;
    isToday: boolean;
    isFuture: boolean;
    sessions: unknown[];
  }[];
}) {
  return (
    <div
      className="rounded-2xl p-3 mb-4 flex justify-between items-end"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
    >
      {grid.map((g) => {
        const trained = g.sessions.length > 0;
        return (
          <div key={g.dateKey} className="flex flex-col items-center gap-1.5">
            <span
              className="text-[10px] uppercase tracking-wider font-semibold"
              style={{
                color: g.isToday
                  ? "var(--accent)"
                  : g.isFuture
                    ? "var(--fg-dim)"
                    : "var(--fg-muted)",
              }}
            >
              {g.weekday}
            </span>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold"
              style={{
                background: trained
                  ? "var(--accent)"
                  : g.isToday
                    ? "var(--bg-elevated)"
                    : "transparent",
                border: trained
                  ? "none"
                  : g.isToday
                    ? "1px solid var(--accent)"
                    : "1px solid var(--border)",
                color: trained
                  ? "#0a0a0a"
                  : g.isFuture
                    ? "var(--fg-dim)"
                    : "var(--fg-muted)",
                opacity: g.isFuture ? 0.5 : 1,
              }}
            >
              {trained ? g.sessions.length : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ThisWeekCard({
  analysis,
  momentumStats,
}: {
  analysis: CoachAnalysis;
  momentumStats: MomentumStats;
}) {
  const verdictColor: Record<CoachAnalysis["rhythm"]["verdict"], string> = {
    Strong: "var(--accent)",
    Steady: "#3b82f6",
    Light: "#eab308",
    Inconsistent: "#f97316",
  };

  return (
    <div
      className="rounded-2xl p-4 mb-3"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
    >
      {/* Rhythm verdict + line */}
      <div className="flex items-center justify-between mb-2">
        <p
          className="text-[10px] uppercase tracking-wider font-semibold"
          style={{ color: "var(--fg-dim)" }}
        >
          This week
        </p>
        <span
          className="text-[11px] font-bold px-2.5 py-1 rounded-full"
          style={{
            background: `${verdictColor[analysis.rhythm.verdict]}22`,
            border: `1px solid ${verdictColor[analysis.rhythm.verdict]}66`,
            color: verdictColor[analysis.rhythm.verdict],
          }}
        >
          {analysis.rhythm.verdict}
        </span>
      </div>
      <p className="text-[13px] leading-relaxed">{analysis.rhythm.line}</p>

      {/* Momentum — volume vs last week */}
      <div
        className="mt-4 pt-4 border-t"
        style={{ borderColor: "var(--border)" }}
      >
        <MomentumBars stats={momentumStats} line={analysis.momentum.line} />
      </div>

      {/* Next week */}
      {analysis.nextWeek.length > 0 && (
        <div
          className="mt-4 pt-4 border-t"
          style={{ borderColor: "var(--border)" }}
        >
          <p
            className="text-[10px] uppercase tracking-wider font-semibold mb-2"
            style={{ color: "var(--fg-dim)" }}
          >
            Next 7 days
          </p>
          <ul className="space-y-2">
            {analysis.nextWeek.map((b, i) => (
              <li key={i} className="text-[13px] leading-relaxed flex gap-2">
                <span
                  className="shrink-0 w-1.5 h-1.5 rounded-full mt-2"
                  style={{ background: "var(--accent)" }}
                />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link
        href="/log"
        className="btn-accent inline-flex items-center mt-4 px-4 py-2 rounded-xl text-[12px]"
      >
        Log next session →
      </Link>
    </div>
  );
}

async function generateAnalysis(args: {
  name: string;
  goalDays: number | null;
  experienceLevel: string | null;
  primaryFocus: string | null;
  preferredSplit: string | null;
  trainedDays: number;
  grid: {
    dateKey: string;
    weekday: string;
    isToday: boolean;
    isFuture: boolean;
    sessions: SessionForAnalysis[];
  }[];
  lastWeekSessionCount: number;
}): Promise<AnalysisResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "ANTHROPIC_API_KEY not configured" };
  }

  const sessionLines: string[] = [];
  for (const day of args.grid) {
    if (day.isFuture) continue;
    if (day.sessions.length === 0) {
      sessionLines.push(`- ${day.weekday} ${day.dateKey}: REST`);
      continue;
    }
    for (const s of day.sessions) {
      const shape = shapeForType(s.type);
      const typeLbl = labelForType(s.type);
      const muscles = new Set<string>();
      let workingSets = 0;
      let summary = "";
      if (shape === "STRENGTH") {
        for (const e of s.exercises) {
          if (e.exercise.muscleGroup) muscles.add(e.exercise.muscleGroup);
          for (const set of e.sets) {
            if (set.type !== "WARMUP") workingSets++;
          }
        }
        summary = ` — ${workingSets} working sets across ${Array.from(muscles).join(", ") || "n/a"}`;
      } else {
        const parts: string[] = [];
        if (s.duration) parts.push(`${Math.round(s.duration / 60)} min`);
        if (s.avgHeartRate) parts.push(`avg HR ${s.avgHeartRate}`);
        if (s.maxHeartRate) parts.push(`max HR ${s.maxHeartRate}`);
        summary = ` — ${parts.join(" · ") || "logged"}`;
      }
      const tags: string[] = [];
      if (s.split) tags.push(s.split);
      if (s.isDeload) tags.push("DELOAD");
      if (s.feeling) tags.push(`felt:${s.feeling}`);
      const tagStr = tags.length ? ` {${tags.join(", ")}}` : "";
      sessionLines.push(
        `- ${day.weekday} ${day.dateKey}: [${typeLbl}]${tagStr} ${s.title}${summary}`,
      );
    }
  }

  const profile = [
    args.experienceLevel ? `experience ${args.experienceLevel}` : null,
    args.primaryFocus ? `focus ${args.primaryFocus}` : null,
    args.preferredSplit ? `preferred split ${args.preferredSplit}` : null,
    args.goalDays ? `goal ${args.goalDays}× / week` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const prompt = `You are this athlete's strength coach. Analyze their training week and return ONLY JSON matching the schema below.

ATHLETE: ${args.name}
PROFILE: ${profile || "n/a"}
DAYS TRAINED THIS WEEK: ${args.trainedDays}${args.goalDays ? ` (goal ${args.goalDays})` : ""}
SESSIONS LAST WEEK (for momentum): ${args.lastWeekSessionCount}

THIS WEEK (Mon → Sun, only days up to today):
${sessionLines.join("\n")}

Return JSON exactly in this shape (no markdown fence, no prose):
{
  "rhythm": {
    "verdict": "Strong" | "Steady" | "Light" | "Inconsistent",
    "line": "ONE sentence ≤ 22 words on the cadence. Reference specific weekdays from the data."
  },
  "coverage": {
    "trained": ["Chest", "Back", ...],   // muscle GROUPS hit ≥ 1 working set this week; capitalized, deduped
    "missed": ["Legs", ...],              // muscle GROUPS the athlete normally targets but did not train this week (use their preferred split as the expectation when known)
    "note": "ONE sentence ≤ 18 words explaining the imbalance or confirming balance. Empty string if nothing notable."
  },
  "momentum": {
    "direction": "up" | "flat" | "down",  // vs. last week's volume + frequency
    "line": "ONE sentence ≤ 22 words explaining the trend."
  },
  "nextWeek": [
    "ONE concrete bullet ≤ 20 words — name a specific day or session type, not generic advice.",
    "OPTIONAL second bullet, same constraint. Skip if not needed."
  ]
}

Rules:
- Be specific. Reference weekdays and session titles from the data.
- Do not invent sessions. If the week is sparse, say so and recommend the right next step.
- Verdicts: Strong = hit goal + variety; Steady = on track but unremarkable; Light = under goal or recovery week; Inconsistent = scattered or skipping common muscles.
- Output valid JSON only. No commentary.`;

  let raw = "";
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      temperature: 0.5,
      system:
        "You return ONLY valid JSON matching the schema in the user message. No prose, no markdown fences.",
      messages: [{ role: "user", content: prompt }],
    });
    // First text block from Claude's content array.
    const block = resp.content.find((c) => c.type === "text");
    if (block && block.type === "text") raw = block.text;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Claude call failed: ${msg.slice(0, 240)}` };
  }
  if (!raw) {
    return { ok: false, error: "Claude returned an empty response" };
  }
  // Extract the first balanced JSON object from the response. The model
  // sometimes wraps it in ```json fences or trailing prose despite the
  // prompt; this skips past anything before the first {.
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace <= firstBrace) {
    return {
      ok: false,
      error: `No JSON in response: ${raw.slice(0, 160)}`,
    };
  }
  const slice = raw.slice(firstBrace, lastBrace + 1);
  try {
    const parsed = JSON.parse(slice) as CoachAnalysis;
    if (!parsed.coverage) {
      parsed.coverage = { trained: [], missed: [], note: "" };
    }
    if (!Array.isArray(parsed.coverage.trained)) parsed.coverage.trained = [];
    if (!Array.isArray(parsed.coverage.missed)) parsed.coverage.missed = [];
    if (!Array.isArray(parsed.nextWeek)) parsed.nextWeek = [];
    return { ok: true, analysis: parsed };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `JSON parse failed: ${msg} · raw: ${slice.slice(0, 160)}`,
    };
  }
}

function dowInTz(d: Date, tz: string): number {
  // Returns JS-style weekday (0 = Sun … 6 = Sat) in the user's tz.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  }).formatToParts(d);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
}
