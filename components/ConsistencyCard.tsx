import { prisma } from "@/lib/db";
import {
  startOfWeek,
  endOfWeek,
  subWeeks,
  addDays,
  format,
} from "date-fns";

// Vercel runs in UTC but the user lives in MST; compute calendar-day
// deltas in MST so "6 days ago" doesn't tip over into 7 days for late-day
// workouts logged near the UTC boundary.
const MST_OFFSET_MS = 7 * 60 * 60 * 1000;
const mstDayIndex = (d: Date) =>
  Math.floor((d.getTime() - MST_OFFSET_MS) / 86_400_000);
const daysSinceInMST = (now: Date, then: Date) =>
  mstDayIndex(now) - mstDayIndex(then);
import { shapeForType } from "@/lib/exercises";
import MuscleMap, { type MuscleRecency } from "@/components/MuscleMap";

const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

export default async function ConsistencyCard({
  userId,
  trainingDaysGoal,
}: {
  userId: string;
  trainingDaysGoal?: number | null;
}) {
  // Pull enough history to compute a multi-week streak and muscle recency.
  const since = startOfWeek(subWeeks(new Date(), 25), { weekStartsOn: 1 });
  const workouts = await prisma.workout.findMany({
    where: { userId, date: { gte: since } },
    include: {
      exercises: {
        include: { exercise: true, sets: true },
      },
    },
    orderBy: { date: "desc" },
  });

  if (workouts.length === 0) return null;

  const today = new Date();
  const goal = Math.max(1, trainingDaysGoal ?? 4);

  // ----- Goal-hit week streak: consecutive weeks where the user trained
  // on at least `goal` distinct days. The current week doesn't break the
  // streak until it actually ends — if it hasn't met the goal yet, we
  // count from the prior week.
  const distinctDaysInWeek = (weekIdx: number) => {
    const start = startOfWeek(subWeeks(today, weekIdx), { weekStartsOn: 1 });
    const end = endOfWeek(start, { weekStartsOn: 1 });
    const days = new Set<string>();
    for (const w of workouts) {
      const d = new Date(w.date);
      if (d >= start && d <= end) days.add(format(d, "yyyy-MM-dd"));
    }
    return days.size;
  };
  const weekMetGoal = (weekIdx: number) => distinctDaysInWeek(weekIdx) >= goal;
  let streak = 0;
  const startIdx = weekMetGoal(0) ? 0 : 1;
  for (let i = startIdx; i < 26; i++) {
    if (weekMetGoal(i)) streak++;
    else break;
  }

  // ----- This-week day dots
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const daysThisWeek = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    const key = format(d, "yyyy-MM-dd");
    const hasWorkout = workouts.some(
      (w) => format(new Date(w.date), "yyyy-MM-dd") === key
    );
    return { date: d, hasWorkout, isFuture: d > today };
  });
  const daysHit = daysThisWeek.filter((d) => d.hasWorkout).length;

  // Recency at the broad-group level (Chest / Back / Shoulders / Arms /
  // Legs / Core), driven entirely off the `muscleGroup` column the user
  // saw when they logged each exercise. Compound lifts hit multiple
  // muscles in a region — squats credit the whole leg block, bench
  // presses credit the whole chest block — so collapsing to one specific
  // muscle per lift would lie. Every specific region in MuscleMap takes
  // its broad group's recency so the body lights up by area.
  const BROAD_TO_SPECIFICS: Record<string, string[]> = {
    Chest: ["Pec Major", "Pec Minor", "Serratus"],
    Back: ["Lats", "Traps", "Rhomboids", "Lower Back", "Teres"],
    Shoulders: ["Front Delts", "Side Delts", "Rear Delts"],
    Arms: ["Biceps", "Brachialis", "Triceps", "Forearms"],
    Legs: ["Quads", "Hamstrings", "Glutes", "Adductors", "Abductors", "Calves", "Tibialis"],
    Core: ["Abs", "Obliques"],
  };

  // The seed library tags exercises with a mix of broad ("Chest", "Back")
  // and specific ("Quads", "Triceps") muscleGroup strings — normalize both
  // to one of the 6 broad regions so any logged exercise contributes.
  const TO_BROAD: Record<string, string> = {
    Chest: "Chest",
    Back: "Back",
    "Lower Back": "Back",
    Shoulders: "Shoulders",
    Arms: "Arms",
    Biceps: "Arms",
    Triceps: "Arms",
    Forearms: "Arms",
    Legs: "Legs",
    Quads: "Legs",
    Hamstrings: "Legs",
    Glutes: "Legs",
    Calves: "Legs",
    Core: "Core",
  };

  const broadRecency: Record<string, number> = {};
  for (const w of workouts) {
    if (shapeForType(w.type) !== "STRENGTH") continue;
    const days = daysSinceInMST(today, new Date(w.date));
    for (const we of w.exercises) {
      const hit = we.sets.some(
        (s) => s.type === "WORKING" || s.type === "SUPERSET" || s.type === "DROP_SET"
      );
      if (!hit) continue;
      const raw = we.exercise.muscleGroup;
      if (!raw) continue;
      const broad = TO_BROAD[raw];
      if (!broad) continue;
      if (broadRecency[broad] === undefined || days < broadRecency[broad]) {
        broadRecency[broad] = days;
      }
    }
  }

  const recency: MuscleRecency = {};
  for (const [broad, specifics] of Object.entries(BROAD_TO_SPECIFICS)) {
    const d = broadRecency[broad];
    if (d === undefined) continue;
    for (const m of specifics) recency[m] = d;
  }

  return (
    <div className="card p-4 mb-4">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <p className="label">Consistency</p>
          <h2 className="text-[14px] font-semibold tracking-tight leading-none mt-1">
            Your rhythm
          </h2>
        </div>
        {streak > 0 && (
          <span
            className="label text-[10px] px-2 py-1 rounded-full nums"
            style={{
              background: "rgba(249,115,22,0.12)",
              border: "1px solid rgba(249,115,22,0.35)",
              color: "#fb923c",
              fontFamily: "var(--font-geist-mono)",
            }}
            title={`Consecutive weeks meeting your ${goal}-day training goal`}
          >
            🔥 {streak}-wk streak
          </span>
        )}
      </div>

      <div className="flex items-start gap-4">
        <MuscleMap recency={recency} />

        <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch py-1">
          <div>
            <p
              className="label text-[9px] mb-2"
              style={{ color: "var(--fg-dim)" }}
            >
              This week
            </p>
            <div className="flex gap-1.5 mb-2">
              {daysThisWeek.map((d, i) => (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center gap-1"
                  title={format(d.date, "EEE MMM d")}
                >
                  <span
                    className="w-6 h-6 rounded-full"
                    style={{
                      background: d.hasWorkout
                        ? "var(--accent)"
                        : d.isFuture
                          ? "transparent"
                          : "var(--bg-elevated)",
                      border: d.isFuture
                        ? "1px dashed var(--border)"
                        : "none",
                    }}
                  />
                  <span
                    className="text-[9px]"
                    style={{
                      color: "var(--fg-dim)",
                      fontFamily: "var(--font-geist-mono)",
                    }}
                  >
                    {WEEKDAY_LABELS[i]}
                  </span>
                </div>
              ))}
            </div>
            <p
              className="text-[11px] nums"
              style={{
                color: daysHit >= goal ? "var(--accent)" : "var(--fg-muted)",
                fontFamily: "var(--font-geist-mono)",
              }}
            >
              {daysHit} / {goal} days
              {daysHit >= goal && " ✓"}
            </p>
          </div>

          <div className="flex items-center gap-3 mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
            <Legend color="var(--accent)" label="Fresh" />
            <Legend color="rgba(234,179,8,0.55)" label="Stale" />
            <Legend color="var(--bg-elevated)" label="Cold" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span
        className="w-2 h-2 rounded-sm"
        style={{ background: color, border: "1px solid var(--border)" }}
      />
      <span
        className="text-[9px]"
        style={{
          color: "var(--fg-dim)",
          fontFamily: "var(--font-geist-mono)",
        }}
      >
        {label}
      </span>
    </div>
  );
}
