import Link from "next/link";
import { format, subDays, differenceInDays } from "date-fns";
import Anthropic from "@anthropic-ai/sdk";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import {
  shapeForType,
  labelForType,
  scanGroupFor,
  SCAN_GROUPS,
} from "@/lib/exercises";
import { mergeLiftsWithTargets } from "@/lib/strengthProgression";
import { computeWeakSpots } from "@/lib/weakSpots";
import TopLiftsCard from "@/components/TopLiftsCard";
import CoverageBars, { type MuscleCoverage } from "@/components/CoverageBars";
import Projections from "@/components/Projections";
import { buildProjections } from "@/lib/projections";
import WeakSpots from "@/components/WeakSpots";
import BackButton from "@/components/BackButton";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DAY_ABBR_MON_FIRST = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Muscle groups the body scan renders. "Lower Back" folds into Back; "Other",
// the coarse "Arms"/"Legs", and untagged lifts fold in via scanGroupFor, which
// infers the group from the lift name.
const SCAN_MUSCLES = SCAN_GROUPS;

// Scan group for a logged lift. Prefers the stored muscleGroup and falls back
// to inferring from the name, so ad-hoc lifts logged by voice or prescribed by
// the coach — created with no muscleGroup — still count toward coverage.
function normalizeMuscle(
  name: string,
  mg: string | null | undefined,
): string | null {
  return scanGroupFor(name, mg);
}

type SetLike = { type: string };
type ExerciseLike = {
  exercise: { name: string; muscleGroup: string | null };
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
      const m = normalizeMuscle(e.exercise.name, e.exercise.muscleGroup);
      if (!m) continue;
      const n = workingSetCount(e.sets);
      if (n > 0) out[m] = (out[m] ?? 0) + n;
    }
  }
  return out;
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
    monday.getTime() - 7 * 24 * 60 * 60 * 1000, // 14 days: this week + last, for coverage
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

  // Last week's sessions — the per-muscle comparison the coverage bars show.
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
  // `v3` bump: the momentum bars and the next-7-days list are gone, so the
  // model no longer generates those fields and older cached analyses — which
  // still carry them — must regenerate.
  const fingerprint = `${weekKey}|${thisWeekSessions.length}|${latestUpdate}|v3`;

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
  // Exercise library for the "+ Add target" picker on the Strength card.
  const exercises = await prisma.exercise.findMany({
    where: { OR: [{ ownerId: null }, { ownerId: userId }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
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
  // Best straight working set per lift, plus each lift's session-by-session
  // trend for the row sparkline. See lib/projections.ts.
  const projections = buildProjections(liftHistory);

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

  // ---- Body-scan coverage (computed, not model-generated) ----
  const thisWeekByMuscle = setsByMuscle(thisWeekSessions);
  const lastWeekByMuscle = setsByMuscle(lastWeekSessions);

  // Most-recent working set per muscle across the 12-week lift history so the
  // scan can show "last trained" even for muscles untouched this week.
  const lastTrainedByMuscle: Record<string, number> = {};
  for (const w of liftHistory) {
    const at = (w.endedAt ?? w.startedAt ?? w.date).getTime();
    for (const e of w.exercises) {
      const m = normalizeMuscle(e.exercise.name, e.exercise.muscleGroup);
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
      <div className="flex items-center gap-3 mb-4">
        <BackButton href="/" ariaLabel="Back to feed" />
        <h1 className="text-[22px] font-bold tracking-tight leading-none flex-1">
          Progress
        </h1>
      </div>

      {/* One hero for the week. The page used to open with the same fact three
          times — a date range in the subtitle, a strip of day dots, and a card
          headed "This week" — so the week's story is told once, in one card:
          what you did, how it rates, and the one sentence about it. */}
      <WeekHero
        grid={grid}
        weekStart={monday}
        trainedDays={trainedDays}
        goalDays={goalDays}
        streakDays={streakDays}
        rhythm={analysis.ok ? analysis.analysis.rhythm : null}
      />

      {!analysis.ok && (
        <div
          className="rounded-2xl p-4 mb-3"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
        >
          <p className="text-[13px] mb-2" style={{ color: "var(--fg-dim)" }}>
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

      {/* Everything below the week is a standing view of the training, not of
          these seven days. One rhythm down the page instead of three different
          gaps. */}
      <div className="space-y-3">
        <TopLiftsCard lifts={topLifts} exercises={exercises} />

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

        <WeakSpots spots={weakSpots} />
      </div>
    </div>
  );
}

const VERDICT_COLOR: Record<CoachAnalysis["rhythm"]["verdict"], string> = {
  Strong: "var(--accent)",
  Steady: "#3b82f6",
  Light: "#eab308",
  Inconsistent: "#f97316",
};

/// The week, told once. A row of day dots for what happened, the count against
/// the goal for whether it was enough, the coach's verdict and sentence for
/// what it means, and the one action that follows from it.
function WeekHero({
  grid,
  weekStart,
  trainedDays,
  goalDays,
  streakDays,
  rhythm,
}: {
  grid: {
    dateKey: string;
    weekday: string;
    isToday: boolean;
    isFuture: boolean;
    sessions: unknown[];
  }[];
  weekStart: Date;
  trainedDays: number;
  goalDays: number | null;
  streakDays: number;
  rhythm: CoachAnalysis["rhythm"] | null;
}) {
  const weekEnd = new Date(weekStart.getTime() + 6 * 86400_000);
  // The ring fills toward the goal; with no goal set it just reads as trained
  // days and never pretends to measure progress toward a number nobody chose.
  const pct = goalDays ? Math.min(1, trainedDays / goalDays) : 0;

  return (
    <div
      className="rounded-2xl overflow-hidden mb-3"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label text-[9px]" style={{ color: "var(--fg-dim)" }}>
            {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d")}
          </p>
          <p className="mt-1.5 flex items-baseline gap-1.5">
            <span
              className="nums font-bold text-[30px] leading-none tracking-tight"
              style={{ fontFamily: "var(--font-geist-mono)" }}
            >
              {trainedDays}
            </span>
            <span className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
              {goalDays ? `of ${goalDays} days` : trainedDays === 1 ? "day" : "days"}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {streakDays > 0 && (
            <span
              className="nums text-[11px] font-bold px-2.5 py-1 rounded-full"
              style={{
                background: "var(--accent-dim)",
                border: "1px solid rgba(34,197,94,0.3)",
                color: "var(--accent)",
                fontFamily: "var(--font-geist-mono)",
              }}
              title="Consecutive days trained"
            >
              🔥 {streakDays}d
            </span>
          )}
          {rhythm && (
            <span
              className="text-[11px] font-bold px-2.5 py-1 rounded-full"
              style={{
                background: `${VERDICT_COLOR[rhythm.verdict]}22`,
                border: `1px solid ${VERDICT_COLOR[rhythm.verdict]}66`,
                color: VERDICT_COLOR[rhythm.verdict],
              }}
            >
              {rhythm.verdict}
            </span>
          )}
        </div>
      </div>

      {/* Goal progress, as a hairline rather than a third number. */}
      {goalDays ? (
        <div className="px-4">
          <div
            className="rounded-full overflow-hidden"
            style={{ height: 3, background: "var(--bg-elevated)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${pct * 100}%`,
                background: "var(--accent)",
              }}
            />
          </div>
        </div>
      ) : null}

      <div className="px-4 py-3.5 flex justify-between items-end">
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

      {rhythm?.line && (
        <p
          className="px-4 pb-4 text-[13px] leading-relaxed"
          style={{ color: "var(--fg-muted)" }}
        >
          {rhythm.line}
        </p>
      )}

      <Link
        href="/log"
        className="block px-4 py-3 text-[13px] font-semibold text-center transition-colors active:opacity-70"
        style={{
          borderTop: "1px solid var(--border)",
          color: "var(--accent)",
        }}
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
  }
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
