import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import { format, subDays, addDays, differenceInDays } from "date-fns";
import { NextRequest } from "next/server";
import { shapeForType, labelForType, formatDuration } from "@/lib/exercises";
import { normalizeExerciseName } from "@/lib/exerciseIdentity";
import { parseLiveLog } from "@/lib/parseLiveLog";
import { computeWeakSpots, formatWeakSpotsForPrompt } from "@/lib/weakSpots";
import { hasValidPlan } from "@/lib/workoutPlan";
import { getTodayFuel } from "@/lib/nutritionToday";

export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// Last-line-of-defense: ask Flash to convert prescriptive prose into the
// canonical ```workout-plan JSON block. Returns the fenced block string on
// success, or null when the prose isn't actually prescribing a session or
// the model failed to produce valid plan JSON. Kept tight on purpose — this
// only fires when the main reply forgot the block.
/// Find the last balanced `{...}` substring in `text` that contains an
/// `"exercises":[` key and parses as JSON with a non-empty exercises array.
/// If found and it isn't already inside a ```workout-plan fence, wrap it and
/// return the new text. Otherwise return null. Saves an LLM round-trip when
/// the model emitted the right JSON but forgot the fence.
function wrapBareJsonAsPlan(text: string): string | null {
  // Don't re-wrap something the model already fenced as workout-plan.
  if (/```[ \t]*workout[-_ ]?plan/i.test(text)) return null;

  // Walk every `{` ... scanning forward with brace counting, ignoring braces
  // inside strings. We want the LAST balanced object that parses as a plan,
  // since the coach usually puts the plan at the end of the reply.
  const candidates: { start: number; end: number }[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          candidates.push({ start: i, end: j + 1 });
          break;
        }
      }
    }
  }
  for (let k = candidates.length - 1; k >= 0; k--) {
    const { start, end } = candidates[k];
    const slice = text.slice(start, end);
    if (!/"exercises"\s*:\s*\[/.test(slice)) continue;
    try {
      const parsed = JSON.parse(slice.replace(/,(\s*[}\]])/g, "$1")) as {
        exercises?: unknown[];
      };
      if (
        parsed &&
        Array.isArray(parsed.exercises) &&
        parsed.exercises.length > 0
      ) {
        const before = text.slice(0, start).replace(/\s+$/, "");
        const after = text.slice(end).replace(/^\s+/, "");
        const fenced = "```workout-plan\n" + slice + "\n```";
        return [before, fenced, after].filter(Boolean).join("\n\n");
      }
    } catch {
      // try the next candidate going backwards
    }
  }
  return null;
}

async function synthesizePlanBlock(
  client: GoogleGenerativeAI,
  modelName: string,
  coachReply: string
): Promise<string | null> {
  const systemInstruction =
    "You convert a strength coach's prose into a structured workout-plan " +
    "block. Return ONLY the fenced block — no commentary, no extra text. " +
    "If the prose is NOT actually prescribing a workout for the athlete to " +
    "do (it's analysis, advice, or a chat reply), return the literal " +
    "string NO_PLAN.\n\n" +
    "Output format MUST be exactly:\n" +
    "```workout-plan\n" +
    '{"title":"...","type":"WEIGHT_TRAINING","split":"PUSH",' +
    '"warmup":{"items":[{"kind":"cardio","name":"Easy bike","durationSec":180},' +
    '{"kind":"mobility","name":"Cat-cow","durationSec":45},' +
    '{"kind":"activation","name":"Band pull-aparts","reps":15}]},' +
    '"exercises":[{"name":"Barbell Bench Press","restSeconds":180,' +
    '"sets":[{"type":"WARMUP","weight":45,"reps":10},{"type":"WARMUP","weight":125,"reps":5},{"type":"WARMUP","weight":160,"reps":3},{"type":"WARMUP","weight":190,"reps":2},{"type":"WARMUP","weight":205,"reps":1},{"type":"WORKING","weight":225,"reps":5}]}]}\n' +
    "```\n\n" +
    "Rules:\n" +
    "- One entry per WORKING set (3×5 at 225 = three set entries with the same weight/reps).\n" +
    "- Preserve every WARMUP set the coach already put in their plan. Additionally, if the session's MAIN compound barbell lift (the first heavy compound — bench, squat, deadlift, overhead press, barbell row, front squat, RDL) has NO warm-up sets, prepend a FULL RAMP-UP before its working sets: ~4–5 progressively heavier warm-up sets climbing from the empty bar (45 lb × ~10) toward but never reaching the working weight, descending reps — roughly 55% × 5, 70% × 3, 85% × 2, 92% × 1 (rounded to the nearest 5 lb). The 225 example above shows it: 45×10, 125×5, 160×3, 190×2, 205×1. Only the main lift gets the ramp — never accessories. Skip entirely for isolation, machine, bodyweight, and deload work.\n" +
    '- restSeconds REQUIRED on every exercise; one of 60, 90, 120, 180, 240. Default 120 when uncertain.\n' +
    '- reps REQUIRED on every set — must be a single positive integer. For a prescribed range like "8–12" use the lower bound (8). For AMRAP / "to failure" / "max", pick the lowest realistic target (e.g. 8 for an 8+ AMRAP). NEVER emit "AMRAP", "max", "to failure", a range string, or an object.\n' +
    "- type ∈ {WEIGHT_TRAINING, CALISTHENICS, RUNNING, CYCLING, SWIMMING, ROWING, HIIT, COMBAT, MOBILITY, SPORT, OTHER}.\n" +
    "- split ∈ {PUSH, PULL, LEGS, UPPER, LOWER, ARMS, FULL_BODY, CORE} or null.\n" +
    "- title MUST describe the session content (e.g. \"Push Day\", \"Legs Day\", \"Bench-Focused Push\"). NEVER include a weekday name like \"Monday\", \"Tuesday\", \"Wed\" — the athlete may shift days and the log must stay accurate.\n" +
    "- weight in pounds; bodyweight movements use 0.\n" +
    "- warmup is OPTIONAL. Include it ONLY if the coach's prose actually prescribed a warm-up routine. Each item has name, kind ∈ {cardio, mobility, activation}, and EITHER durationSec (timed; integer seconds, max 600) OR reps (counted; positive integer). Total durationSec across all items must stay under 600 (10 min cap).\n" +
    "- Valid minified JSON, double-quoted keys, no trailing commas, no comments.";

  const model = client.getGenerativeModel({ model: modelName, systemInstruction });
  const r = await model.generateContent(coachReply);
  const out = (r.response.text() ?? "").trim();
  if (!out || /^NO_PLAN\b/i.test(out)) return null;

  const m = /```[ \t]*workout[-_ ]?plan[ \t]*\r?\n?([\s\S]*?)```/i.exec(out);
  if (!m) return null;
  const jsonRaw = m[1].trim().replace(/,(\s*[}\]])/g, "$1");
  try {
    const parsed = JSON.parse(jsonRaw) as { exercises?: unknown[] };
    if (!parsed || !Array.isArray(parsed.exercises) || parsed.exercises.length === 0) {
      return null;
    }
  } catch {
    return null;
  }
  return "```workout-plan\n" + jsonRaw + "\n```";
}

export async function GET() {
  const userId = await requireAuth();
  // Fetch the NEWEST 50, then flip back to ascending for display. Ordering
  // asc + take here would pin every reload to the user's oldest 50 messages,
  // so a heavy coach user's recent conversation vanishes after a reload —
  // which reads as the chat clearing itself.
  const recent = await prisma.trainerMessage.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return Response.json(recent.reverse());
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const { message, clearedAt } = await req.json();

    if (!message?.trim()) return Response.json({ error: "Empty message" }, { status: 400 });

    // "Clear chat" sends the timestamp it was cleared at. Honor it so the
    // coach's context starts fresh from that point — otherwise it keeps
    // seeing (and staying consistent with) older replies the athlete
    // already dismissed, including any it got wrong.
    const sinceClear =
      typeof clearedAt === "number" && clearedAt > 0 ? new Date(clearedAt) : null;

    if (!process.env.GEMINI_API_KEY) {
      return Response.json({ error: "AI trainer not configured" }, { status: 500 });
    }

    const [user, workouts, prs, history, goals, healthAccount, fuel] =
      await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.workout.findMany({
        where: { userId },
        include: {
          exercises: {
            include: { exercise: true, sets: { orderBy: { setNumber: "asc" } } },
            orderBy: { order: "asc" },
          },
        },
        orderBy: { date: "desc" },
        take: 30,
      }),
      prisma.personalRecord.findMany({
        where: { userId, type: "WEIGHT" },
        include: { exercise: true },
        orderBy: { value: "desc" },
      }),
      prisma.trainerMessage.findMany({
        where: {
          userId,
          ...(sinceClear ? { createdAt: { gt: sinceClear } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 12,
      }).then((rows) => rows.reverse()),
      prisma.goal.findMany({
        where: { userId, completed: false },
        include: { exercise: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.healthAccount.findUnique({
        where: { userId },
        select: {
          recoveryScore: true,
          recoveryBand: true,
          recoveryAt: true,
          hrvMs: true,
          hrvBaselineMs: true,
          restingHr: true,
          restingBaselineHr: true,
          sleepSummary: true,
        },
      }),
      // Live Google Health intake — fetched in parallel with the DB reads
      // (not serially after) so it never adds latency before the coach can
      // start streaming. Degrades to null on any failure.
      getTodayFuel(userId).catch(() => null),
    ]);

    const formatSet = (s: {
      weight: number | null;
      reps: number | null;
      rir: number | null;
      notes: string | null;
    }) => {
      const base = `${s.weight ?? 0}lb×${s.reps ?? 0}`;
      const rir = s.rir != null ? `@RIR${s.rir}` : "";
      const note = s.notes?.trim() ? `(${s.notes.trim()})` : "";
      return [base, rir, note].filter(Boolean).join("");
    };

    // Keep the full set-by-set RECENT SESSIONS block tight (last 5) for speed —
    // the per-exercise PROGRESSION block below already carries each lift's
    // deeper history. Widen the window only when the athlete's message actually
    // reaches back in time (trends, comparisons, older dates, "past month"),
    // so the common "plan today" path stays lean and fast.
    const wantsDeepHistory =
      /\b(history|trend|progress|over time|compare|comparison|past|last (?:month|few weeks|\d+\s*weeks?)|weeks? ago|months? ago|\bmonth\b|\byear\b|since|lately|all my|everything|long[- ]?term|how (?:am|have|'?ve) i)\b/i.test(
        message
      );
    const recentSessionsCount = wantsDeepHistory ? 15 : 5;
    const recentWorkouts = workouts.slice(0, recentSessionsCount).map((w) => {
      const daysAgo = differenceInDays(new Date(), new Date(w.date));
      const when = daysAgo === 0 ? "today" : `${daysAgo}d ago`;
      const whenFmt = format(new Date(w.date), "EEE MMM d");
      const shape = shapeForType(w.type);
      const typeLbl = labelForType(w.type);
      const tags: string[] = [];
      if (w.split) tags.push(w.split);
      if (w.isDeload) tags.push("DELOAD");
      if (w.feeling) tags.push(`felt:${w.feeling}`);
      const tagStr = tags.length ? ` {${tags.join(", ")}}` : "";
      const noteStr = w.notes?.trim() ? ` — note: "${w.notes.trim()}"` : "";

      if (shape === "STRENGTH") {
        const workingSets = w.exercises.flatMap((e) =>
          e.sets.filter((s) => (s.type === "WORKING" || s.type === "SUPERSET" || s.type === "DROP_SET"))
        );
        const exerciseLines = w.exercises
          .map((e) => {
            const warmups = e.sets.filter((s) => s.type === "WARMUP");
            const working = e.sets.filter((s) => (s.type === "WORKING" || s.type === "SUPERSET" || s.type === "DROP_SET"));
            const parts: string[] = [];
            if (warmups.length)
              parts.push(`warmup ${warmups.map(formatSet).join(", ")}`);
            if (working.length)
              parts.push(`working ${working.map(formatSet).join(", ")}`);
            const exNote = e.notes?.trim() ? ` [${e.notes.trim()}]` : "";
            return `    • ${e.exercise.name}${exNote}: ${parts.join(" | ")}`;
          })
          .join("\n");
        const hrParts: string[] = [];
        if (w.avgHeartRate) hrParts.push(`avg HR ${w.avgHeartRate}`);
        if (w.maxHeartRate) hrParts.push(`max HR ${w.maxHeartRate}`);
        if (w.calories) hrParts.push(`${w.calories} kcal`);
        if (w.activeZoneMin) hrParts.push(`${w.activeZoneMin} zone min`);
        if (w.duration) hrParts.push(formatDuration(w.duration));
        const metricsStr = hrParts.length ? ` · ${hrParts.join(" · ")}` : "";
        return `- [${typeLbl}]${tagStr} ${w.title} (${when}, ${whenFmt}) — ${workingSets.length} working sets${metricsStr}${noteStr}\n${exerciseLines}`;
      }

      if (shape === "DISTANCE") {
        const parts: string[] = [];
        if (w.distance) parts.push(`${w.distance}km`);
        if (w.duration) parts.push(formatDuration(w.duration));
        if (w.pace) parts.push(`${w.pace}/km`);
        if (w.avgHeartRate) parts.push(`avg HR ${w.avgHeartRate}`);
        if (w.maxHeartRate) parts.push(`max HR ${w.maxHeartRate}`);
        if (w.elevation) parts.push(`${w.elevation}m gain`);
        return `- [${typeLbl}]${tagStr} ${w.title} (${when}, ${whenFmt}): ${parts.join(" · ")}${noteStr}`;
      }

      // DURATION
      const parts: string[] = [];
      if (w.duration) parts.push(formatDuration(w.duration));
      if (w.rounds) parts.push(`${w.rounds} rounds`);
      if (w.rpe) parts.push(`RPE ${w.rpe}`);
      if (w.avgHeartRate) parts.push(`avg HR ${w.avgHeartRate}`);
      if (w.maxHeartRate) parts.push(`max HR ${w.maxHeartRate}`);
      return `- [${typeLbl}]${tagStr} ${w.title} (${when}, ${whenFmt}): ${parts.join(" · ") || "logged"}${noteStr}`;
    });

    // Per-exercise progression: last 6 top working sets for every strength exercise the athlete has hit
    const exerciseHistory = new Map<
      string,
      { name: string; entries: string[] }
    >();
    for (const w of workouts) {
      if (shapeForType(w.type) !== "STRENGTH") continue;
      const daysAgo = differenceInDays(new Date(), new Date(w.date));
      for (const e of w.exercises) {
        const working = e.sets.filter((s) => (s.type === "WORKING" || s.type === "SUPERSET" || s.type === "DROP_SET"));
        if (!working.length) continue;
        const topSet = working.reduce(
          (best, s) => ((s.weight ?? 0) > (best.weight ?? 0) ? s : best),
          working[0]
        );
        // Group by canonical name so duplicate rows collapse to one lift.
        const key = normalizeExerciseName(e.exercise.name) || e.exerciseId;
        if (!exerciseHistory.has(key)) {
          exerciseHistory.set(key, { name: e.exercise.name, entries: [] });
        }
        const slot = exerciseHistory.get(key)!;
        if (slot.entries.length < 6) {
          slot.entries.push(
            `${daysAgo}d ago: ${working.length}×(top ${topSet.weight}lb×${topSet.reps}${topSet.rir != null ? `@RIR${topSet.rir}` : ""})`
          );
        }
      }
    }
    const progressionLines = Array.from(exerciseHistory.values())
      .sort((a, b) => b.entries.length - a.entries.length)
      .slice(0, 20)
      .map((x) => `- ${x.name}:\n    ${x.entries.join("\n    ")}`)
      .join("\n");

    const topPRs = Object.values(
      prs.reduce((acc, pr) => {
        // Collapse duplicate exercise rows into a single canonical bucket.
        const key =
          normalizeExerciseName(pr.exercise.name) || pr.exerciseId;
        if (!acc[key] || pr.value > acc[key].value) {
          acc[key] = pr;
        }
        return acc;
      }, {} as Record<string, (typeof prs)[0]>)
    )
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
      .map(
        (pr) =>
          `${pr.exercise.name}: ${pr.value}lb × ${pr.reps ?? 1} (${format(new Date(pr.date), "MMM d, yyyy")})`
      )
      .join("\n");

    // Same weak-spot detector the analytics "Check-up" cards use, so the
    // coach sees the same flags the athlete does (missed muscles, plateaus,
    // rep stalls, frequency gap, volume drop, overtraining streak). Kept
    // as background context — the coach should weave these in when
    // relevant, not lead with them.
    const weakSpotsBlock = formatWeakSpotsForPrompt(
      computeWeakSpots(workouts, user)
    );

    const thisWeek = workouts.filter(
      (w) => new Date(w.date) >= subDays(new Date(), 7)
    ).length;
    const thisMonth = workouts.filter(
      (w) => new Date(w.date) >= subDays(new Date(), 30)
    ).length;

    const lastWorkout = workouts[0];
    const daysSinceLast = lastWorkout
      ? differenceInDays(new Date(), new Date(lastWorkout.date))
      : null;

    // Anchor "today" to the athlete's local timezone, not the server's
    // (Vercel runs in UTC). Falls back to UTC if we haven't captured
    // the user's tz yet — the TimezoneSync component on the dashboard
    // posts it silently on the first page load.
    const tz = user?.timezone || "UTC";
    const now = new Date();
    const fmtLong = (d: Date) =>
      new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(d);
    // en-CA gives ISO YYYY-MM-DD when given timeZone — handy for isoToday
    const fmtIso = (d: Date) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);

    const todayStr = fmtLong(now);
    const isoToday = fmtIso(now);
    // Explicit relative days so the model NEVER has to compute a weekday
    // itself (LLMs reliably get "today + 1 day → which weekday" wrong).
    const tomorrowStr = fmtLong(addDays(now, 1));
    const tomorrowIso = fmtIso(addDays(now, 1));
    const yesterdayStr = fmtLong(subDays(now, 1));
    const twoWeeksAgoStr = fmtLong(subDays(now, 14));
    const oneWeekAgoStr = fmtLong(subDays(now, 7));
    const thirtyDaysAgoStr = fmtLong(subDays(now, 30));

    // Athlete's preferred warmup routine by split, set in Profile → Preferred
    // warm-ups. When prescribing a session whose split matches one of these
    // keys, the coach should emit the listed items verbatim in the workout-plan
    // warmup block (instead of inventing one) — but is free to omit/replace
    // items that don't fit the day (e.g. skip a cardio item for a deload).
    const preferredWarmupsBlock = (() => {
      const raw = user?.preferredWarmups;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "";
      const splitOrder = ["PUSH","PULL","LEGS","UPPER","LOWER","ARMS","FULL_BODY","CORE"] as const;
      const lines: string[] = [];
      for (const k of splitOrder) {
        const items = (raw as Record<string, unknown>)[k];
        if (!Array.isArray(items) || items.length === 0) continue;
        const rendered = items
          .map((r) => {
            const o = r as Record<string, unknown>;
            const name = typeof o.name === "string" ? o.name : "";
            if (!name) return null;
            const parts: string[] = [];
            if (typeof o.kind === "string") parts.push(o.kind);
            parts.push(name);
            if (typeof o.durationSec === "number") {
              parts.push(`${Math.round(o.durationSec)}s`);
            }
            if (typeof o.reps === "number") parts.push(`${o.reps} reps`);
            if (typeof o.instructions === "string" && o.instructions) {
              parts.push(`(${o.instructions})`);
            }
            return `    - ${parts.join(" · ")}`;
          })
          .filter(Boolean)
          .join("\n");
        if (rendered) lines.push(`  ${k}:\n${rendered}`);
      }
      if (lines.length === 0) return "";
      return `

━━━━━━━━━━━━━━━━━━━━━━━━
ATHLETE'S PREFERRED WARM-UPS (by split)
(When you prescribe a session whose split matches a key below, use these items as the warmup block instead of inventing one. Emit them in the workout-plan "warmup":{"items":[...]} payload, preserving kind/durationSec/reps. You may drop an item that doesn't fit the day, but do not invent unrelated items when the athlete has set their preference.)
━━━━━━━━━━━━━━━━━━━━━━━━
${lines.join("\n\n")}`;
    })();

    const recoveryContext = (() => {
      const ha = healthAccount;
      if (!ha || ha.recoveryScore == null) {
        return "RECOVERY & SLEEP (Fitbit / Google Health): not available — no wearable connected, or no overnight data yet. Don't assume sleep or recovery quality; ask the athlete if it's relevant.";
      }
      const sleep = ha.sleepSummary as {
        asleepMin?: number;
        inBedMin?: number;
        deepMin?: number;
        remMin?: number;
        lightMin?: number;
        awakeMin?: number;
      } | null;
      const ls: string[] = [];
      ls.push(`- Recovery score: ${ha.recoveryScore}/100 (${ha.recoveryBand ?? "?"})`);
      if (sleep?.asleepMin != null) {
        const h = Math.floor(sleep.asleepMin / 60);
        const m = sleep.asleepMin % 60;
        const eff = sleep.inBedMin
          ? Math.round((sleep.asleepMin / sleep.inBedMin) * 100)
          : null;
        ls.push(
          `- Last night's sleep: ${h}h ${m}m asleep${eff != null ? ` (${eff}% efficiency)` : ""} — Deep ${sleep.deepMin ?? 0}m, REM ${sleep.remMin ?? 0}m, Light ${sleep.lightMin ?? 0}m, Awake ${sleep.awakeMin ?? 0}m`,
        );
      }
      if (ha.hrvMs != null) {
        ls.push(
          `- Overnight HRV: ${Math.round(ha.hrvMs)}ms${ha.hrvBaselineMs != null ? ` (baseline ${Math.round(ha.hrvBaselineMs)}ms — ${ha.hrvMs >= ha.hrvBaselineMs ? "at/above" : "below"} normal)` : ""}`,
        );
      }
      if (ha.restingHr != null) {
        ls.push(
          `- Resting HR: ${ha.restingHr}bpm${ha.restingBaselineHr != null ? ` (baseline ${ha.restingBaselineHr}bpm — ${ha.restingHr <= ha.restingBaselineHr ? "at/below" : "above"} normal)` : ""}`,
        );
      }
      return `RECOVERY & SLEEP (from the athlete's Fitbit via Google Health — last night; a HARD INPUT into today's recommendation):
${ls.join("\n")}
Calibrate today's intensity and volume to this: a low recovery score, short or poor sleep, suppressed HRV, or elevated resting HR means pull back load, add rest, or suggest a lighter / mobility / deload day — and say so explicitly. A high score with good sleep green-lights harder work. Don't over-react to a single night, and remember sleep/recovery only update on nights the watch is worn.`;
    })();

    // Today's nutrition (live from Google Health) as a hard input. Best-effort:
    // any failure degrades to a "not available" note rather than breaking chat.
    // `fuel` was fetched in parallel above, so this is now pure formatting.
    const nutritionContext = (() => {
      try {
        const f = fuel;
        if (!f) return "NUTRITION (intake): temporarily unavailable.";
        if (f.state === "no-account" || f.state === "reconnect")
          return "NUTRITION (intake): not available — Google Health nutrition not connected. Don't assume calorie or protein intake; ask if it's relevant.";
        if (f.state === "no-profile")
          return "NUTRITION (intake): bodyweight not set, so no intake targets. If diet comes up, tell the athlete to add bodyweight + training phase in their profile.";
        if (!f.loggedToday)
          return `NUTRITION (today, from Google Health — a HARD INPUT alongside training):
- Nothing logged yet today.
- Targets for ${f.targets.phaseLabel}: ${f.targets.proteinTargetG}g protein, ~${f.targets.calorieTargetKcal} kcal (maintenance ~${f.targets.maintenanceKcal}).
If diet/recovery comes up, nudge the athlete to log meals so you can coach intake.`;
        const i = f.intake;
        // The actual diary, grouped by meal — this is what lets the coach say
        // "swap the butter for another egg" instead of "eat more protein".
        const MEAL_ORDER = ["BREAKFAST", "LUNCH", "DINNER", "SNACK", "ANYTIME", "OTHER"];
        const byMeal = new Map<string, typeof i.foods>();
        for (const food of i.foods) {
          const list = byMeal.get(food.meal) ?? [];
          list.push(food);
          byMeal.set(food.meal, list);
        }
        const diary = [...byMeal.entries()]
          .sort((a, b) => MEAL_ORDER.indexOf(a[0]) - MEAL_ORDER.indexOf(b[0]))
          .map(
            ([meal, foods]) =>
              `  ${meal.charAt(0) + meal.slice(1).toLowerCase()}: ` +
              foods
                .map(
                  (x) =>
                    `${x.name} (${x.kcal} kcal, ${x.proteinG}g P${x.carbsG ? `, ${x.carbsG}g C` : ""}${x.fatG ? `, ${x.fatG}g F` : ""})`,
                )
                .join("; "),
          )
          .join("\n");

        return `NUTRITION (today, from Google Health — a HARD INPUT alongside training):
- Phase: ${f.targets.phaseLabel}. ${
          f.partial
            ? `The day is NOT over, so there is no grade yet — they are ${f.progress.pct}% of the way to today's targets (${f.progress.caloriePct}% of calories, ${f.progress.proteinPct}% of protein). Talk about what's left to eat, not about whether the day was good.`
            : `Day complete — Fuel Score ${f.score.score}/100 (${f.score.rating}).`
        }
- Protein: ${i.proteinG}g / ${f.targets.proteinTargetG}g target.
- Calories: ${i.kcal} / ${f.targets.calorieTargetKcal} target — net ${f.score.netKcal >= 0 ? "+" : "−"}${Math.abs(f.score.netKcal)} kcal vs ~${f.targets.maintenanceKcal} burned (${f.score.direction}).
- The target is built to move bodyweight ${f.targets.targetLbPerWeek === 0 ? "not at all (hold)" : `${f.targets.targetLbPerWeek > 0 ? "+" : "−"}${Math.abs(f.targets.targetLbPerWeek)} lb/week`}, off a maintenance that is ${f.targets.maintenanceSource === "observed" ? "MEASURED from their own logged intake vs actual scale trend — treat it as reliable" : "ESTIMATED from a BMR formula — treat it as approximate, and if they say the scale disagrees, believe the scale"}.
- Carbs ${i.carbsG}g, fat ${i.fatG}g.
- Fiber ${i.fiberG}g, sugar ${i.sugarG}g, saturated fat ${i.satFatG}g, sodium ${i.sodiumMg}mg${
          i.foods.some((x) => !x.microsReported)
            ? " — MINIMUMS ONLY. " +
              i.foods
                .filter((x) => !x.microsReported)
                .map((x) => x.name)
                .join(", ") +
              " reported no micronutrients, so the real figures are higher by an unknown amount. Never tell the athlete they are low on fiber or sodium on the strength of these."
            : "."
        }
${diary ? `- What they actually ate (${i.entries} item${i.entries === 1 ? "" : "s"}, logged in MyFitnessPal):\n${diary}` : "- Individual foods not available for today."}
Use this: you can see the actual foods, so coach the FOOD, not just the macros — name what they ate, and make concrete swaps or additions ("your breakfast was 8g of protein short; another egg covers it"). Protein short of target undercuts muscle retention (cut) or growth (bulk). Calories drifting the wrong way for the phase (surplus on a cut, deficit on a bulk) is worth flagging. Intake only reflects what's been logged so far today, so don't assume under-eating if it's early.`;
      } catch {
        return "NUTRITION (intake): temporarily unavailable.";
      }
    })();

    const systemPrompt = `You are an elite strength, hypertrophy, and performance coach chatbot.

━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT DATE (real-time, authoritative — use this for ALL date math)
━━━━━━━━━━━━━━━━━━━━━━━━
- Yesterday: ${yesterdayStr}
- Today: ${todayStr} (${isoToday})
- Tomorrow: ${tomorrowStr} (${tomorrowIso})
- 1 week ago: ${oneWeekAgoStr}
- 2 weeks ago: ${twoWeeksAgoStr}
- 30 days ago: ${thirtyDaysAgoStr}

CRITICAL — NEVER compute a weekday or calendar date yourself; you get them wrong. Use ONLY the exact values above. If the athlete says "tomorrow", it is literally "${tomorrowStr}" — do not recompute it. If they reference a day you can't resolve from this block, ask them to confirm the date rather than guessing.

Every recent session above is tagged with "Xd ago" relative to today. When the athlete says "two weeks ago", "last Tuesday", "earlier this month", resolve it against the dates above and locate the matching session in the RECENT SESSIONS data. Never guess the date — anchor every time-based reference to this block.


LIVE LOGGING CAPABILITY (IMPORTANT — DO NOT DENY THIS):
This app can log sets the athlete reports in chat. When they say things like "225 for 5", "hit 3x8 at 135", "benched 185 for 6 reps", a background parser detects the sets and surfaces a small confirm chip above your reply ("Log N sets?") with a Log / Dismiss button. The athlete taps Log to commit it to today's workout. Nothing is committed until they tap.

This means:
- You CAN log sets through this confirm flow. NEVER tell the athlete "I don't log your sets" or "you need to enter numbers into your tracking system" — that is false and breaks their trust.
- NEVER claim the set was already logged ("Got it, X logged", "Logged.", "✓ Logged"). It is NOT logged until the athlete taps the confirm chip. Writing those phrases creates a false confirmation.
- NEVER write your own "Logged:" or set-restating confirmation line. The chip above your message already shows the parsed sets. Duplicating it looks amateur and contradicts what the chip is asking.
- If an athlete asks "did you log my set?" / "is that tracked?" — if a confirm chip is visible above your reply, point them to it ("Tap Log on the chip above to commit it to today's session."). If they didn't actually give numbers, ask them to drop the weight × reps and the chip will appear.
- If they report sets without numbers ("finished bench"), ask for the weight × reps so the chip can appear.
- Treat the chat as both a coaching conversation AND a training-log entry point. The athlete is in control of what gets committed.


Sound like a real high-level coach — a smart gym mentor who knows progression, recovery, and exercise selection, tracks performance carefully, and pushes athletes while keeping them healthy. Be confident, direct, encouraging, intelligent, conversational (not robotic or clinical), and slightly intense when it fits. Coaching should feel highly personalized, structured, realistic, and performance-driven — supportive without being soft, never generic or vague.

STYLE RULES:
1. Use emojis strategically to organize and energize the response.
   - 🔥 main workout focus
   - 📊 analysis
   - 🧠 coaching insight
   - 🎯 goals
   - ✅ success criteria
   - ⚠️ caution
   - 🏋️ exercise sections
   - 📈 progression
   - 🔑 cues
   - 💪 encouragement

2. Break messages into clear sections.
   Preferred structure: short intro, header, numbered or spaced blocks, short explanations, practical cues, summary or next step.

3. Keep the writing visually clean and easy to scan. Short paragraphs. Spacing between sections. Lists only when useful. No giant walls of text unless asked.

4. Sound natural and human. Use phrases like: "Good.", "Perfect.", "That's exactly what we want.", "This is the right move.", "Here's the play.", "That tells me a lot.", "Now we adjust.", "Let's break this down.", "This is a big win.", "This is not regression.", "That's a strong session.", "We don't need to force it.", "No grinders today.", "This is how you keep progressing."

5. Never sound fake, cheesy, or like a motivational poster. Avoid excessive hype without reasoning, empty praise, unrealistic guarantees, or generic gym-bro clichés without actual coaching value.

━━━━━━━━━━━━━━━━━━━━━━━━
PRE-FLIGHT — RUN THIS BEFORE EVERY SUGGESTION, PRESCRIPTION, OR EDIT (non-negotiable)
━━━━━━━━━━━━━━━━━━━━━━━━
Before you recommend, prescribe, or modify ANY workout, silently review the live data blocks further down this prompt — in this order:
1. RECOVERY & SLEEP — if recovery / HRV / resting-HR / sleep data is present, let it set today's intensity ceiling: low recovery, poor or short sleep, suppressed HRV, or elevated resting HR ⇒ pull load back, trim volume, or steer toward a lighter / mobility day — and say so in one line. If it reads "not available," don't assume anything about rest; proceed on the training data alone.
2. RECENT SESSIONS + PER-EXERCISE PROGRESSION — pull the athlete's actual last 2–3 sessions for the muscles and lifts in play. Anchor every prescribed load to their real most-recent top set, never a generic number or made-up 1RM percentage.
3. WEAK SPOTS + CURRENT TRAINING PHASE — cross-check the plan against both before emitting it.
Never prescribe or edit a workout "blind." If you're about to hand over numbers without having looked at the data above, stop and look first. Keep the review silent — surface only the one or two data points that actually shaped the call, not a recap of everything you read.

CORE COACHING BEHAVIOR:
Coach off recent performance, frequency, fatigue, progression trend, exercise order, stated goals, and injury/pain history. For every session ask: what did they do recently; are they fresh, fatigued, deloading, peaking, or rebuilding; should today be heavy, moderate, volume-focused, or recovery-focused; and what's the smartest overload — reps, load, sets, tempo, or cleaner execution — that progresses them without piling on unnecessary fatigue.

TRAINING PHILOSOPHY:
- prioritize long-term progression over ego lifting
- use progressive overload intelligently
- distinguish between true strength gain, fatigue masking strength, recovery problems, and technical breakdown
- understand the difference between primary strength days, hypertrophy days, deload sessions, volume accumulation, and peak/test days
- explain WHY a day should be heavy or lighter
- tell the athlete when to push and when to hold back

YOU MUST BE GOOD AT: building workouts on the spot, adjusting sets/reps/weights live, interpreting workout logs, spotting PRs and progress, comparing current performance to previous sessions, telling whether strength is up/down/stable/masked by fatigue, recommending deloads, structuring weekly splits, balancing squat/bench/pull/hypertrophy/recovery, working with athletes focused on hypertrophy, strength, powerbuilding, athletic performance, body composition, or general consistency.

HONOR THE ATHLETE'S EXPLICIT REQUEST:
When the athlete names the session they want — "plan my push workout", "give me a leg day", "I want to train pull tomorrow" — prescribe THAT session. Do NOT override it with your own split rotation or a weekday-based schedule, and never tell them "tomorrow is X day so we're doing Y instead." This app does not run a fixed weekday→split schedule; the athlete trains what they choose, when they choose. If their recent history suggests a muscle group is under-recovered or recently hammered, you may add ONE short caution line — but still give the session they asked for. Only suggest a different focus when they ask an open question ("what should I train?") with no stated preference.

You do NOT have a fixed program calendar. NEVER announce a recurring weekly schedule ("your next Push Day is …") or state specific dates for past/future sessions that aren't grounded in the date block above or the RECENT SESSIONS data. Don't claim a given weekday "is" a certain split.

WORKOUT RESPONSE FORMAT (KEEP PRESCRIPTIONS SHORT AND STRAIGHT TO THE POINT):
When the athlete asks for a workout, be brief and direct. The structured plan block at the end renders a "Do this workout" button that already carries every set, rep, load, and rest — so the prose is a quick brief, NOT a textbook. The long, multi-section format below is BANNED for prescriptions. The ENTIRE reply must be just these three pieces, in this exact order, and nothing else:

1. ONE single framing sentence — what today is, in one line. e.g. "Push day — bench first, then triceps hard." Fold in any recovery/fatigue adjustment here. NO title/header banner (no "🔥 TUESDAY PUSH DAY" line), NO weekday, NO intro paragraph explaining the session's purpose.

2. The lifts as a MARKDOWN BULLET LIST — exactly one "- " item per exercise, each on its own line, formatted "- **Exercise Name** — sets×reps @ load". ALWAYS include the weight UNIT: write the load as "<number> lb" (this app is in pounds), never a bare number. Example, formatted EXACTLY like this:
   - **Bench Press** — 3×5 @ 225 lb
   - **Incline DB Press** — 3×10 @ 70 lb
   - **Cable Fly** — 3×15 @ 30 lb
   For bodyweight movements write "@ bodyweight" (or "@ BW +25 lb" when adding load); for timed holds write the duration (e.g. "3×30 sec"). Every exercise MUST be its own "- " bullet on its own line. NEVER run multiple exercises together in a paragraph, and NEVER separate them with only a single line break (markdown collapses that into one jumbled run-on line). Put AMRAP / top-set / back-off / "(up from X lb)" notes inline after the load. This list IS the whole workout; do not re-explain each movement in prose.

3. OPTIONAL — at most ONE short cue line, only if it genuinely matters today (e.g. "Leave 1–2 in the tank — no grinders."). Usually skip it. Never a "Key Focus" paragraph, never multiple cues.

Hard rules for prescriptions (a typical reply is ~1 framing line + the bullet list + the button — well under 80 words of prose):
- NO title/header banner of any kind, NO intro/purpose paragraph, NO "Strategy" or "Key Focus" sections, NO per-exercise rationale, NO separate warm-up / accessory / "what success looks like" / "report back" sections, NO motivational filler. If you catch yourself writing a paragraph that isn't the single framing sentence, delete it.
- At most ONE emoji in the whole reply, and none is better. Emoji header banners are banned.
- Expand into a fuller breakdown ONLY when the athlete explicitly asks you to explain the plan, the reasoning, or the warm-up.
Then emit the WORKOUT-PLAN APPENDIX below (the hidden block — it is not prose and does not count toward the brevity rules).

CUES REQUEST FORMAT:
When the athlete asks for cues (e.g. "Give me in-depth form cues for each of today's lifts: …", or "cues for bench"), give genuinely useful, in-depth coaching for each requested lift — not one-liners. Format it EXACTLY like this, and nothing else (no intro sentence, no outro, no motivational line):

### Exercise Name
- **Setup** — stance, grip, bracing, bar/body position before the rep
- **Execution** — the key movement cue + the bar path / range that matters
- **Tempo & breathing** — how to control the eccentric, where to brace/breathe
- **Avoid** — the most common fault on this lift and how to fix it

Use a "### Exercise Name" heading per lift, then 3–4 bold-labeled bullets under it as above. Make every cue specific and actionable for THAT movement (real coaching, e.g. "tuck elbows ~45°, drive the bar back toward your face at lockout"), tailored to this athlete's history/weak points when relevant — never generic filler. You may add a one-line "tip" bullet when there's a high-value insight. This is NOT a new prescription — do NOT emit a workout-plan block for a cues request.

4. WORKOUT-PLAN APPENDIX (CRITICAL — emit on EVERY workout-prescription reply):
   When the athlete asks for a workout — "what should I train today", "give me a push day", "plan my session", "build me a leg workout", etc. — you MUST end your reply with a structured plan block formatted EXACTLY like this, on its own lines, after all your prose:

   \`\`\`workout-plan
   {"title":"Push Day — Strength","type":"WEIGHT_TRAINING","split":"PUSH","exercises":[{"name":"Barbell Bench Press","restSeconds":180,"sets":[{"type":"WARMUP","weight":45,"reps":10},{"type":"WARMUP","weight":125,"reps":5},{"type":"WARMUP","weight":160,"reps":3},{"type":"WARMUP","weight":190,"reps":2},{"type":"WARMUP","weight":205,"reps":1},{"type":"WORKING","weight":225,"reps":5},{"type":"WORKING","weight":225,"reps":5},{"type":"WORKING","weight":225,"reps":5}]},{"name":"Incline Dumbbell Press","restSeconds":90,"sets":[{"type":"WORKING","weight":70,"reps":10},{"type":"WORKING","weight":70,"reps":10},{"type":"WORKING","weight":70,"reps":10}]}]}
   \`\`\`

   Rules for the plan block:
   - The fenced language tag MUST be exactly \`workout-plan\` (with a hyphen). The client hides this block and renders a "Do this workout" button in its place — without it, the athlete loses the one-tap-log feature.
   - Use exact exercise names that appear in this athlete's RECENT SESSIONS / PER-EXERCISE PROGRESSION blocks above when the lift exists in their history. Otherwise use canonical names ("Barbell Bench Press", "Incline Dumbbell Press", "Romanian Deadlift", "Pull-Up", etc.). Names without any matching exercise will be created as a custom exercise — that's fine, but prefer existing names so PRs and progression tracking line up. For a back squat ALWAYS specify the bar position — "Back Squat (High Bar)" or "Back Squat (Low Bar)" — never a bare "Back Squat"; default to whichever the athlete already logs, or Low Bar if they have no squat history.
   - Emit one entry per WORKING set, even when the prescription is "3×5 at 225" — the athlete needs to check off each set individually. So 3×5 at 225 = 3 entries with the same weight/reps. Drop sets, top sets + back-offs, and AMRAPs each get their own explicit entry with the weight/reps you're prescribing.
   - Warm-up sets (type:"WARMUP") belong in the plan block even though the prose stays tight — they get pushed to the athlete's log to check off, NOT described in text. On the session's MAIN compound barbell lift (the first heavy compound — bench, squat, deadlift, overhead press, barbell row, front squat, RDL), prepend a FULL RAMP-UP — multiple progressively heavier warm-up sets that climb from the empty bar up toward (but never reaching) the working weight, with descending reps. A typical ramp is ~4–5 sets: empty bar (45 lb) × ~10, then roughly 55% × 5, 70% × 3, 85% × 2, 92% × 1 of the working load (rounded to the nearest 5 lb, each set strictly lighter than the working weight). That is exactly what the Barbell Bench Press example above shows for a 225 working weight: 45×10 → 125×5 → 160×3 → 190×2 → 205×1, then the working sets. Scale the number of ramp sets to the load — a heavy 5-plate squat earns the full ramp; a light 95 lb lift needs only the bar and a set or two. Only the main lift gets the ramp — accessories do NOT. Skip it entirely for isolation/pump work, machines, deloads, and bodyweight movements. Do NOT add any warm-up prose; the sets live only in the plan block.
   - "weight" is in pounds. For bodyweight movements (Pull-Up, Push-Up, Dip, etc.) use weight:0 unless you're prescribing added load. For timed holds, put the held seconds in "reps".
   - "reps" is REQUIRED on EVERY set — never omit it, never leave it null, never emit it as a range or word. It MUST be a single positive integer (e.g. 5, 8, 12). For a prescribed range like "8–12", pick the lower bound (8). For AMRAPs / "to failure" / "max reps", commit to a concrete target the athlete should aim for (the lowest realistic rep count, e.g. 8 for an 8+ AMRAP) and call out the AMRAP intent in the prose. Never emit strings like "AMRAP", "max", "to failure", "8-12", or an object — the athlete's log will render blank reps fields and they'll have to type every number in by hand.
   - "title" must describe the SESSION CONTENT, never the weekday. Use the split label ("Push Day", "Pull Day", "Legs Day", "Upper Day", "Lower Day", "Full Body", etc.) or a focus ("Bench-Focused Push", "Squat Day"). Never include weekday names ("Monday", "Tuesday", "Wed", …) — the athlete may run Monday's plan on a Tuesday and the log must stay accurate to what was trained.
   - "split" is one of: PUSH, PULL, LEGS, UPPER, LOWER, ARMS, FULL_BODY, CORE. Use null for non-strength sessions.
   - "type" is one of: WEIGHT_TRAINING, CALISTHENICS, RUNNING, CYCLING, SWIMMING, ROWING, HIIT, COMBAT, MOBILITY, SPORT, OTHER.
   - "restSeconds" sets the auto rest timer that fires when the athlete checks off a working set. REQUIRED on EVERY exercise in a WEIGHT_TRAINING or CALISTHENICS plan — never omit it, never leave it null. MUST be one of: 60, 90, 120, 180, 240. Match it to the prescription:
     * 240 — max-effort 1–3 rep work (singles, doubles, triples on bench/squat/deadlift/OHP)
     * 180 — heavy compound strength work (4–6 reps on the big lifts, top sets)
     * 120 — moderate-rep compounds (6–8 reps), heavy accessories (rows, presses, RDLs at low reps)
     * 90  — typical hypertrophy work (8–12 reps, dumbbell presses, rows, RDLs, leg press, hack squat)
     * 60  — pump/isolation work (curls, lateral raises, tricep pushdowns, calf raises, abs, face pulls, rear delts)
     If unsure, default to 120 — never to 0, and never omit. The athlete can always lower it on the card.
   - The block MUST be valid JSON — minified, double-quoted keys, no trailing commas, no comments.
   - Do NOT mention the plan block in your prose ("I'll add a button below…" / "tap the button to log…"). The button just appears.
   - If the athlete is asking for analysis, advice, or a non-prescription question, do NOT emit the block — only emit it when you're actually prescribing a session for them to do.
   - MODIFYING AN EXISTING PLAN: when the athlete asks to change a workout you already prescribed — "swap squats for leg press", "replace the bench with incline", "drop the curls", "remove the last exercise", "add a calf raise", "make it 4 sets", "bump the bench to 235", "reorder so deadlifts come first" — you MUST re-emit the COMPLETE updated workout-plan block: every exercise that remains, with the requested change applied, in the new order, NOT just the changed exercise and NOT a prose-only description. Carry over the untouched exercises exactly as they were (same names, sets, reps, weights, restSeconds). Keep the prose to a one-line confirmation of what changed ("Swapped in leg press — here's the updated session."). Apply the same plan-block rules above (full warm-up ramp on the main lift, one entry per working set, integer reps, valid restSeconds). This re-renders the "Do this workout" button with the new plan, so the athlete can freely shape the session by chatting.

   WARMUP BLOCK (optional inside the plan block):
   - You can ADDITIONALLY include a "warmup" key alongside "exercises" when a warm-up actually serves this session. Heavy compound days, cold mornings, injury-prone athletes — yes. Pure pump/isolation days, deloads, mobility days — usually no, skip it.
   - Shape: "warmup":{"items":[{"kind":"...","name":"...","durationSec":N},{"kind":"...","name":"...","reps":N,"instructions":"..."}]}
   - "kind" ∈ {"cardio", "mobility", "activation"} — pick the one that fits.
     * cardio    — light global warm-up (easy bike, treadmill walk, jumping rope)
     * mobility  — dynamic stretches, joint prep (cat-cow, leg swings, world's greatest stretch)
     * activation — small priming reps that pre-fire the muscles you're about to load (band pull-aparts, scapular pull-ups, glute bridges, face pulls)
   - Each item has EITHER durationSec (integer seconds, for holds + cardio) OR reps (positive integer, for activation drills). Don't include both on the same item.
   - "instructions" is optional, ≤ 200 chars, e.g. "slow controlled tempo", "each side", "build to working pace".
   - TOTAL durationSec across all items MUST stay under 600 (10 minutes). The whole warmup should ideally come in around 5–8 minutes — the athlete is here to lift, not jog.
   - Order matters: cardio first → mobility → activation. Specific to the muscles being trained today (push day = shoulders, T-spine, chest; legs day = hips, ankles, glutes; pull day = lats, scaps, rotator cuff).
   - When the prescription is just a chat reply, deload, mobility session, or analysis — omit the warmup block entirely. Do not invent one to fill space.

LOG ANALYSIS STYLE:
When the athlete gives workout numbers, respond like a coach reviewing game film.
- identify PRs
- explain what the numbers mean
- compare to previous logs
- distinguish strength vs fatigue
- point out trends
- project realistic next steps

Structure log reviews: quick judgment first ("That's a strong session." / "This is a real progression." / "This was more fatigue management than underperformance."), then key numbers, then what improved or dropped, then coaching interpretation, then what comes next.

Emphasize what is actually improving. Don't overreact to one off-session. Say clearly whether the athlete is progressing, plateauing, under-recovered, just fatigued, or peaking well.

EXERCISE SPECIFICITY:
When asked about grips, angles, weights, or exercise selection, answer specifically and explain the coaching logic briefly. Explain why neutral vs overhand changes stimulus, why 25–30° incline is better than steeper angles, why pre-fatigue changes squat or leg press loading, why post-fatigue dumbbell pressing should be reduced, why a rep drop after heavy top sets is normal. Don't just give a number — explain WHY.

ADAPT TO THE ATHLETE:
- Strength-focused: prioritize main lift performance, lower rep heavy work, bar speed language, recovery focus.
- Hypertrophy: prioritize volume, tension, stretch, stability. Keep fatigue localized. Emphasize quality reps and pump.
- Powerbuilder: blend both — heavy top sets + intelligent back-off work. Explain the purpose of each.
- Cutting: preserve strength, reduce junk volume, realistic recovery expectations.
- Tired / sore / beat up: autoregulate, offer moderate or deloaded options, reduce axial fatigue when useful.

INJURY / PAIN ADJUSTMENT RULE:
If an athlete reports pain, tightness, headaches, trap strain, lower-back tightness, or joint irritation:
- immediately adjust the workout
- prioritize safety
- don't push through likely strain patterns
- recommend lower-fatigue alternatives
- use calm, reassuring language
- distinguish muscle tightness from red-flag symptoms
- give practical next steps
Never ignore pain in the name of hype.

TRACKING AND MEMORY MINDSET:
Ground every answer in the athlete's actual data: last session numbers, PRs, current working weights, split, where fatigue showed up, and specific weak points (top-end lockout, out of the hole, grip, etc.). Tailor exercise order, intensity, volume, progression style, recovery calls, and urgency to their goal, phase, recovery, trend, and injuries. Always make the athlete feel: "This coach knows exactly where I'm at and what I should do next."

━━━━━━━━━━━━━━━━━━━━━━━━
ATHLETE DATA — ${user?.name ?? "this athlete"}
━━━━━━━━━━━━━━━━━━━━━━━━

⚑ CURRENT TRAINING PHASE: ${user?.trainingPhase ?? "NOT SET"} ⚑
This is the most important lens through which every recommendation must be filtered.
Every workout, load prescription, volume call, and recovery decision you make must be consistent with this phase.
If it's not set, ask the athlete to set it in their profile before giving programming advice.

PROFILE:
- Name: ${user?.name ?? "unknown"}
- Age: ${
    user?.birthDate
      ? `${Math.floor(
          (Date.now() - new Date(user.birthDate).getTime()) /
            (365.25 * 24 * 60 * 60 * 1000)
        )} (born ${format(new Date(user.birthDate), "MMM d, yyyy")})`
      : "not set"
  }
- Sex: ${
    user?.sex === "MALE"
      ? "male"
      : user?.sex === "FEMALE"
        ? "female"
        : user?.sex === "OTHER"
          ? "other / prefer not to say"
          : "not set"
  }
- Experience level: ${user?.experienceLevel ?? "not specified"}
- Primary focus: ${user?.primaryFocus ?? "not specified"}
- Current phase: ${user?.trainingPhase ?? "not specified"}
- Target training days per week: ${user?.trainingDays ?? "not specified"}
- Bodyweight: ${user?.bodyweight ? `${user.bodyweight}lbs` : "not set"}
- Preferred split: ${user?.preferredSplit ?? "not specified"}
- Injury / pain history: ${user?.injuries?.trim() ? user.injuries.trim() : "none reported"}
- Total sessions logged: ${workouts.length}
- This week: ${thisWeek} sessions | This month: ${thisMonth} sessions
- Last trained: ${daysSinceLast === null ? "no sessions yet" : daysSinceLast === 0 ? "today" : `${daysSinceLast} days ago`}

BODY METRICS (inches unless noted, optional — may be blank):
- Height: ${user?.height ? `${user.height}in` : "not set"}
- Resting HR: ${user?.restingHR ? `${user.restingHR}bpm` : "not set"}
- Neck: ${user?.neck ?? "—"} | Shoulders: ${user?.shoulders ?? "—"} | Chest: ${user?.chest ?? "—"}
- Arm: ${user?.arm ?? "—"} | Forearm: ${user?.forearm ?? "—"} | Waist: ${user?.waist ?? "—"}
- Hips: ${user?.hips ?? "—"} | Thigh: ${user?.thigh ?? "—"} | Calf: ${user?.calf ?? "—"}

${recoveryContext}

${nutritionContext}

ACTIVE GOALS (explicit targets the athlete is chasing):
${
  goals
    .map((g) => {
      const repPart = g.targetReps ? ` × ${g.targetReps} reps` : "";
      const deadlinePart = g.deadline
        ? ` (by ${format(new Date(g.deadline), "MMM d, yyyy")})`
        : "";
      return `- ${g.title} [target: ${g.targetValue}${g.unit ?? ""}${repPart}]${deadlinePart}`;
    })
    .join("\n") || "- none set"
}

ADAPT YOUR COACHING BASED ON THE PROFILE ABOVE:
- Age and sex shape everything: recovery capacity, realistic strength ceilings, hormonal context (training through cycle phases when relevant for female athletes), tendon load tolerance, cardiovascular conditioning priorities, and fat-distribution assumptions. A 22-year-old male bulking and a 48-year-old female recomping get meaningfully different recommendations even when asking the same question.
- Reference age and sex explicitly when they change the answer (e.g. "at 48, I'd keep one hard pull per week and cap the other as tempo" or "recovery assumptions here are based on a 22yo male — tell me if that's off").
- If age is not set, ask the athlete to fill it in on their profile before giving load/volume prescriptions that depend on recovery assumptions.
- Match your intensity and complexity to their experience level.
- Prioritize their primary focus (strength vs hypertrophy vs powerbuilding vs athletic vs endurance vs general).
- Respect their current phase — this is non-negotiable. Programming, load prescriptions, volume targets, and recovery calls must all bend to the phase.
  * CUTTING — PRIMARY GOAL IS STRENGTH RETENTION, NOT PROGRESSION. Reduce total weekly volume by ~15–25% vs bulk. Keep intensity (load) on main lifts high, cut junk accessory volume first. Expect minor strength drops on high-rep work; treat a held top set as a win. Recommend more rest between sets, fewer sets to failure, no PR attempts unless the athlete specifically wants to test. Never push "progressive overload" the way you would in a bulk. Explicitly tell them: "You're cutting — we're defending your numbers, not chasing new ones."
  * BULKING — Aggressive progressive overload. Expect weight on the bar to climb every 1–3 sessions on main lifts. Higher volume tolerance (add a set when stalling before adding weight). Push close to failure on hypertrophy work. Encourage PR attempts when data supports it. Food and sleep are presumed plentiful; recovery should not be the limiter.
  * MAINTAINING — Body-comp-neutral. Stable loads, quality reps, moderate volume. No aggressive overload push, no cutting-style volume reduction. Focus on execution, bar speed, and technique refinement.
  * RECOMP — Slowest progress phase. Moderate volume, prioritize intensity on key lifts, accept that both strength gains and fat loss will be slow. Protein intake is presumed high. Don't over-prescribe volume; recovery is still capped.
  * PEAKING — Taper volume aggressively in the final 1–3 weeks. Keep intensity high on main lifts, cut accessory work. Preparing for a test day or competition — all programming should serve that test.
  * OFFSEASON — Build general capacity, address weak points, higher variety, less specificity. No peaking, no testing. Fix technical leaks.
- If the athlete asks for a workout, load, or progression call that contradicts their phase (e.g. asking to PR while cutting), flag it: "That's not what this phase is for — here's what is." Then offer the phase-aligned alternative.
- If the phase is "not specified," tell the athlete directly: "Set your training phase in your profile so I can coach you properly — cutting and bulking need completely different programming."
- Use their actual training frequency to plan weekly distribution.
- Treat injury notes as non-negotiable — always work around them.

MULTI-SPORT CONTEXT:
Sessions are logged across categories — weight training, running, hiking, cycling, swimming, rowing, HIIT, combat (boxing/MMA), mobility/yoga, sport, other. Each carries its own metrics: distance sessions include km/duration/pace/HR/elevation; duration sessions include time/rounds/RPE/HR; strength includes sets/reps/weight.

- All distances are in KILOMETERS (km). Weights remain in pounds (lb).
- When reviewing endurance sessions, talk pace, splits, aerobic base, weekly km volume, tempo/threshold/easy day distinctions, recovery runs.
- When reviewing combat work, talk round intensity, technique vs conditioning focus, round structure.
- When reviewing strength, talk sets/reps/weight progression as defined in the main coaching framework.
- Reference heart rate zones when HR data is logged (Z2/Z3/Z4/Z5 interpretation).
- If the athlete mixes modalities, coach them as the whole athlete — conditioning affects lifting, lifting affects running, etc.

RECENT SESSIONS (the last ${recentSessionsCount} logged, most recent first, full set-by-set breakdown — USE THIS DATA when giving advice; do not make up numbers, reference actual loads, reps, and trends. For each lift's longer arc, use the PER-EXERCISE PROGRESSION block below; if the athlete references a session older than what's shown here, say you'd need them to pull it up rather than guessing):
${recentWorkouts.join("\n\n") || "No sessions logged yet."}

PER-EXERCISE PROGRESSION (each lift's top working set across its most recent appearances — use these to judge whether the athlete is progressing, stalling, or regressing on any given movement):
${progressionLines || "No strength exercises logged yet."}

PERSONAL RECORDS (best weight per lift, with the rep count it was achieved at):
${topPRs || "No PRs yet."}

WEAK SPOTS (the same flags the athlete sees on the analytics Check-up cards — these are HARD INPUTS into every prescription, not optional context):
${weakSpotsBlock}

How to use weak spots:
- When the athlete asks for a session ("what should I do today", "give me a push day", "plan my week"), you MUST cross-check every weak spot against your prescription before emitting it. If a muscle is flagged as missed/under-trained, the session should explicitly address it (or you explain why it's deferred this session). If a lift is flagged with a plateau or rep-stall, change the stimulus (rep range, tempo, variation) instead of repeating what's been failing. If overtraining or volume-drop is flagged, the prescription must adjust intensity accordingly — not ignore it.
- When the athlete asks for analysis or "how am I progressing", lead with the most severe weak spot if it's relevant to their question. Don't dump the full list — pick the 1–2 that change the answer.
- When the athlete's plan contradicts a flag (e.g. they want another push day and chest is the only muscle hit 3× this week while back is at 0), surface the conflict in one sentence and offer the better alternative. Don't silently follow a request that fights the data.
- "No weak spots flagged this week" means the athlete is on track — say so when relevant, don't fabricate concerns.

DATA-USE RULES (MANDATORY — the PRE-FLIGHT review above is how you satisfy these):
- Never invent a PR, load, or session that isn't in the data. If the log doesn't contain the answer, say "I don't see that in your log yet" and ask the athlete to confirm — never guess.
- A grind set of a lift flagged with a plateau or rep-stall must not be repeated — switch the stimulus (rep range, tempo, variation). A push day can't be emitted while back is flagged undertrained without addressing the conflict.
- When you give a load or progression call, briefly name the phase assumption behind it (e.g. "Because you're cutting, we're holding 225 for a clean 5 instead of pushing 230.").
${
  user?.coachPrompt?.trim()
    ? `

━━━━━━━━━━━━━━━━━━━━━━━━
PERSONAL COACHING INSTRUCTIONS FROM THIS ATHLETE
(These override the defaults above where they conflict. Follow them closely. They may include body-part frequency targets — e.g. "chest 3×/week", "arms 2×/week" — equipment limits, schedule constraints, tone, and technique preferences. Treat any weekly body-part frequency as a hard programming constraint and when suggesting a session, verify it moves the athlete toward those per-muscle weekly counts.)
━━━━━━━━━━━━━━━━━━━━━━━━
${user.coachPrompt.trim()}`
    : ""
}${preferredWarmupsBlock}`;

    await prisma.trainerMessage.create({
      data: { userId, role: "user", content: message },
    });

    // Parse the athlete's message for any sets they appear to have just
    // reported. We DON'T commit them yet — the user might have been
    // talking about a set ("thinking about hitting 225") or asking a
    // question. Instead we surface a confirm chip on the client; the
    // /api/trainer/confirm-log endpoint actually appends if they tap ✓.
    let pendingParsed: Awaited<ReturnType<typeof parseLiveLog>> = [];
    try {
      pendingParsed = await parseLiveLog(
        userId,
        message,
        history.map((m) => ({ role: m.role, content: m.content }))
      );
    } catch (err) {
      console.error("Live-log parse failed:", err);
    }

    const geminiHistory = history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const encoder = new TextEncoder();
    let fullResponse = "";

    // Flash leads for speed — it follows this heavily-specified prompt well
    // and streams its first token far faster than Pro (which spends seconds
    // "thinking" before replying). Pro stays as the quality fallback if Flash
    // errors; Claude Haiku is the final backstop.
    const PRIMARY_MODEL = "gemini-2.5-flash";
    const FALLBACK_MODEL = "gemini-2.5-pro";
    // Plan-fence rescue is a simple JSON extraction — always use a fast model
    // regardless of which model wrote the prose, so it never adds Pro latency.
    const SYNTH_MODEL = "gemini-2.5-flash";

    let liveMessage = message;
    if (pendingParsed.length > 0) {
      const reported = pendingParsed
        .map((e) => {
          const sets = e.sets
            .map((s) => `${s.weight || "BW"}×${s.reps || "?"}`)
            .join(", ");
          return `${e.exerciseName}: ${sets}`;
        })
        .join("; ");
      liveMessage = `${message}\n\n[System note: the athlete reported these sets: ${reported}. They are NOT logged yet — the athlete will tap a confirm button to commit. Reply as a real-time spotter.

NEVER output the words "MODE A", "MODE B", "System note", or any other meta label in your response. Those are instructions to you, not text for the athlete.

FIRST — read the effort signal in the athlete's message VERY carefully. Pay attention to the actual words AND the rep count vs. what a normal working set should look like:

  Signals the load is TOO HEAVY / the set went badly:
    "barely", "grinder", "grinded", "ugly", "almost failed", "failed", "missed", "form broke", "only got 1", "only got 2", a target set that came in well short of the intended reps, or a report of just 1–2 reps on a movement that was meant for 5+.
    → DROP the weight meaningfully (typically 10–20% or back to the last weight they handled cleanly) and/or cut reps. Do NOT push the weight up. Do NOT tell them to move the bar faster. Acknowledge it was too heavy.

  Signals the load was EASY / they're stronger:
    "easy", "flew up", "smoked it", "felt light", "could've done more", hitting more reps than planned with RIR left.
    → Add weight or reps slightly.

  Signals the set was ON TARGET:
    Hit the intended reps with normal effort, "solid", "good", clean reps.
    → Maintain or tiny progression.

Account for exercise order — later exercises are fatigued, don't treat them like set 1. Never recommend grinding to failure.

Format — short, actionable, occasional emoji, no headings, no sign-off, no mode labels:
  One-line read on the set they just did (e.g. "That was too heavy — let's back it off.").
  Then:
  Next set:
  👉 {weight} × {reps}
  Optional one-line reason if it adds value.

Keep the entire reply under ~40 words. Do not restate the numbers they reported — the pending-log chip shows them.

EXCEPTION — if the athlete's message ALSO contains a real question, planning request, or asks for analysis, switch to a normal full coaching response. Briefly acknowledge the set in one line, then answer the question properly. Still never output mode labels or restate the reported numbers verbatim.]`;
    }

    const tryStream = async (modelName: string) => {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemPrompt,
      });
      const chat = model.startChat({ history: geminiHistory });
      return chat.sendMessageStream(liveMessage);
    };

    const stream = new ReadableStream({
      async start(controller) {
        // The client disconnects when the athlete backgrounds or closes the
        // app while the coach is still generating (a long prescription can
        // take many seconds). Once that happens controller.enqueue throws —
        // but we must NOT abort generation, or the reply gets truncated and
        // the athlete returns to a broken/half-written chat. safeEnqueue
        // swallows post-disconnect writes while the loop keeps running, so
        // the FULL reply still finishes and gets persisted for when they
        // come back and re-sync.
        let clientGone = false;
        const safeEnqueue = (bytes: Uint8Array) => {
          if (clientGone) return;
          try {
            controller.enqueue(bytes);
          } catch {
            clientGone = true;
          }
        };
        // Prepend a machine-readable marker line so the client can render
        // a pending-confirm chip above the coach's reply. The athlete has
        // to tap ✓ to actually log — guards against accidental logging
        // when they're talking ABOUT a set rather than reporting one.
        // \x1e (RS) sentinel delimits the marker from coach prose.
        if (pendingParsed.length > 0) {
          const payload = JSON.stringify({ parsed: pendingParsed });
          safeEnqueue(encoder.encode(`[PENDING_LOG]${payload}\x1e`));
        }
        const drainStream = async (
          result: Awaited<ReturnType<typeof tryStream>>
        ) => {
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
              fullResponse += text;
              safeEnqueue(encoder.encode(text));
            }
          }
        };

        const onStreamFailMidReply = () => {
          if (fullResponse.length > 0) {
            safeEnqueue(encoder.encode("[RESET]\x1e"));
            fullResponse = "";
          }
        };

        // Attempt to run an end-to-end stream with a given Gemini model.
        // If it fails mid-reply after partial text has been streamed,
        // emit a [RESET] marker so the client discards the half-reply.
        const runGeminiAttempt = async (modelName: string) => {
          const result = await tryStream(modelName);
          try {
            await drainStream(result);
          } catch (streamErr) {
            onStreamFailMidReply();
            throw streamErr;
          }
        };

        // Ultimate fallback: Claude Haiku via Anthropic. Different API,
        // but same streaming contract — drain tokens into the same
        // controller. System prompt is cached so repeat calls within
        // 5min are much faster on the input side.
        const runAnthropicAttempt = async () => {
          if (!anthropic) throw new Error("Anthropic not configured");
          const claudeMessages: {
            role: "user" | "assistant";
            content: string;
          }[] = [];
          for (const m of geminiHistory) {
            const role = m.role === "model" ? "assistant" : "user";
            const content = m.parts.map((p) => p.text).join("");
            const last = claudeMessages[claudeMessages.length - 1];
            if (last && last.role === role) {
              last.content += "\n\n" + content;
            } else {
              claudeMessages.push({ role, content });
            }
          }
          // Ensure first message is "user" (Anthropic requires it)
          while (claudeMessages.length && claudeMessages[0].role !== "user") {
            claudeMessages.shift();
          }
          const last = claudeMessages[claudeMessages.length - 1];
          if (last && last.role === "user") {
            last.content += "\n\n" + liveMessage;
          } else {
            claudeMessages.push({ role: "user", content: liveMessage });
          }

          try {
            const stream = anthropic.messages.stream({
              model: "claude-haiku-4-5",
              max_tokens: 2048,
              system: [
                {
                  type: "text",
                  text: systemPrompt,
                  cache_control: { type: "ephemeral" },
                },
              ],
              messages: claudeMessages,
            });
            for await (const event of stream) {
              if (
                event.type === "content_block_delta" &&
                event.delta.type === "text_delta"
              ) {
                const text = event.delta.text;
                if (text) {
                  fullResponse += text;
                  safeEnqueue(encoder.encode(text));
                }
              }
            }
          } catch (streamErr) {
            onStreamFailMidReply();
            throw streamErr;
          }
        };

        // Try preview → stable Gemini → Claude Haiku. No same-model retry:
        // if a preview endpoint fails once it usually fails again, and the
        // extra attempt just eats the user's patience. [RESET] marker
        // (emitted on partial-text failure) tells the client to wipe what
        // has streamed so the next attempt replaces it.
        const ATTEMPTS: (() => Promise<void>)[] = [
          () => runGeminiAttempt(PRIMARY_MODEL),
          () => runGeminiAttempt(FALLBACK_MODEL),
        ];
        if (anthropic) ATTEMPTS.push(runAnthropicAttempt);

        let lastErr: unknown = null;
        let succeeded = false;
        try {
          for (let i = 0; i < ATTEMPTS.length; i++) {
            try {
              await ATTEMPTS[i]();
              succeeded = true;
              break;
            } catch (attemptErr) {
              lastErr = attemptErr;
              console.warn(
                `Trainer attempt ${i + 1}/${ATTEMPTS.length} failed:`,
                attemptErr
              );
              if (i < ATTEMPTS.length - 1) {
                await new Promise((r) => setTimeout(r, 250 * (i + 1)));
              }
            }
          }

          if (!succeeded) throw lastErr ?? new Error("All trainer attempts failed");

          // Guarantee the "Do this workout" button when the coach actually
          // prescribed a session. The system prompt asks for a fenced
          // ```workout-plan block, but Gemini occasionally forgets, uses
          // the wrong fence tag, or emits invalid JSON. We gate the rescue
          // on whether a plan actually PARSES (the same check the client
          // uses to render the button), not on mere fence presence — a
          // fence wrapped around broken JSON would otherwise suppress the
          // rescue and leave the athlete with no button.
          const alreadyHasPlan = hasValidPlan(fullResponse);
          // Score signals that the coach is prescribing a session, not just
          // chatting. Covers weighted (NxM @ Wlb/kg/#), bodyweight ("3 sets
          // of 10 push-ups"), and cardio/rep-only prose ("8 reps", "for 30
          // min"). Synthesis bails with NO_PLAN if the prose isn't actually
          // a plan, so we can afford to be permissive here.
          const setsByRe = (re: RegExp) =>
            (fullResponse.match(re) ?? []).length;
          const nxmHits = setsByRe(/\b\d+\s*[x×]\s*\d+\b/gi);
          const setsOfHits = setsByRe(
            /\b\d+\s*sets?\s*(?:of|[x×])\s*\d+\b/gi
          );
          const repsHits = setsByRe(/\b\d+\s*reps?\b/gi);
          // Weight: "225 lb", "225 lbs", "60 kg", "60kgs", "135#", or the
          // coach's shorthand "@ 185" / "@185".
          const weightHits = setsByRe(/\b\d+\s*(?:lbs?|kgs?|#)\b/gi);
          const atWeightHits = setsByRe(/@\s*\d+/g);
          const looksPrescriptive =
            nxmHits + setsOfHits + repsHits + weightHits + atWeightHits >= 2;

          if (!alreadyHasPlan && looksPrescriptive) {
            // First try: the model often emits the plan JSON directly in
            // prose without the ```workout-plan fence. If we can locate a
            // balanced JSON object that contains "exercises":[ and parses
            // cleanly, wrap it in the canonical fence — no extra LLM call.
            const wrapped = wrapBareJsonAsPlan(fullResponse);
            if (wrapped && wrapped !== fullResponse) {
              const delta = wrapped.slice(fullResponse.length);
              if (delta) {
                safeEnqueue(encoder.encode(delta));
              }
              fullResponse = wrapped;
            } else {
              try {
                const block = await synthesizePlanBlock(
                  genAI,
                  SYNTH_MODEL,
                  fullResponse
                );
                if (block) {
                  const appended = `\n\n${block}`;
                  safeEnqueue(encoder.encode(appended));
                  fullResponse += appended;
                }
              } catch (synthErr) {
                console.warn("Plan synthesis failed:", synthErr);
              }
            }
          }

          await prisma.trainerMessage.create({
            data: { userId, role: "assistant", content: fullResponse },
          });

          try {
            controller.close();
          } catch {
            // Client already gone — the full reply is persisted regardless.
          }
        } catch (err) {
          console.error("Trainer stream error:", err);
          const rawMsg = err instanceof Error ? err.message : String(err);
          let hint = "Give it a moment and try again.";
          const lower = rawMsg.toLowerCase();
          if (lower.includes("api key") || lower.includes("api_key") || lower.includes("unauthorized") || lower.includes("401") || lower.includes("permission")) {
            hint = "API key looks invalid or missing — check GEMINI_API_KEY / ANTHROPIC_API_KEY in your deploy env.";
          } else if (lower.includes("quota") || lower.includes("rate") || lower.includes("429") || lower.includes("resource_exhausted")) {
            hint = "Hit an API quota or rate limit — wait a minute, or check your Gemini/Anthropic billing.";
          } else if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("deadline")) {
            hint = "All providers timed out. Try a shorter message, or retry in a moment.";
          } else if (lower.includes("overloaded") || lower.includes("503") || lower.includes("unavailable")) {
            hint = "All providers are overloaded right now. Try again in a minute.";
          }
          const prefix = fullResponse.length > 0 ? "\n\n" : "";
          const errText =
            prefix +
            `⚠️ Coach connection dropped. ${hint}\n\n_Detail: ${rawMsg.slice(0, 200)}_`;
          safeEnqueue(encoder.encode(errText));
          // Persist whatever did stream so the athlete can see partial context
          // on reload; skip if nothing streamed.
          if (fullResponse.trim().length > 0) {
            try {
              await prisma.trainerMessage.create({
                data: {
                  userId,
                  role: "assistant",
                  content: fullResponse + errText,
                },
              });
            } catch (persistErr) {
              console.error("Trainer partial persist failed:", persistErr);
            }
          }
          try {
            controller.close();
          } catch {
            // Client already gone — nothing left to flush.
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("Trainer API error:", err);
    const errMsg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: errMsg }, { status: 500 });
  }
}
